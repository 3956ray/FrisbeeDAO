// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
// CountersUpgradeable已在新版本中移除，使用内置计数器
import "./AthleteRegistry.sol";

/**
 * @title AchievementTracker
 * @dev 成就追踪合约，记录运动员成就并铸造成就NFT
 */
contract AchievementTracker is 
    Initializable,
    ERC721Upgradeable,
    ERC721URIStorageUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    uint256 private _tokenIdCounter;
    
    AthleteRegistry public athleteRegistry;
    
    // 成就类型枚举
    enum AchievementType {
        Competition,    // 比赛成就
        Training,       // 训练成就
        Record,         // 记录成就
        Community,      // 社区成就
        Special         // 特殊成就
    }
    
    // 成就状态枚举
    enum AchievementStatus {
        Pending,        // 待验证
        Verified,       // 已验证
        Rejected,       // 已拒绝
        Disputed        // 争议中
    }
    
    // 成就信息结构体
    struct Achievement {
        uint256 tokenId;            // NFT Token ID
        address athlete;            // 运动员地址
        AchievementType achievementType; // 成就类型
        string title;               // 成就标题
        string description;         // 成就描述
        string metadataURI;         // 元数据URI
        uint256 timestamp;          // 成就时间
        uint256 submissionTime;     // 提交时间
        AchievementStatus status;   // 状态
        address[] verifiers;        // 验证者列表
        uint256 verificationCount;  // 验证数量
        uint256 requiredVerifications; // 所需验证数量
        mapping(address => bool) hasVerified; // 验证者是否已验证
        string[] evidenceURIs;      // 证据URI列表
    }
    
    // 验证者权重结构体
    struct VerifierWeight {
        uint256 weight;             // 验证权重
        bool isActive;              // 是否活跃
        string expertise;           // 专业领域
    }
    
    // 状态变量
    mapping(uint256 => Achievement) public achievements;
    mapping(address => VerifierWeight) public verifierWeights;
    mapping(address => uint256[]) public athleteAchievements;
    mapping(AchievementType => uint256) public requiredVerificationsByType;
    
    address[] public verifierList;
    uint256[] public allAchievements;
    
    uint256 public submissionFee;
    uint256 public verificationReward;
    uint256 public constant MAX_VERIFIERS_PER_ACHIEVEMENT = 10;
    uint256 public constant MIN_VERIFICATION_WEIGHT = 1;
    uint256 public constant MAX_VERIFICATION_WEIGHT = 10;
    
    // 事件定义
    event AchievementSubmitted(
        uint256 indexed tokenId,
        address indexed athlete,
        AchievementType achievementType,
        string title,
        uint256 timestamp
    );
    
    event AchievementVerified(
        uint256 indexed tokenId,
        address indexed verifier,
        uint256 verificationCount,
        uint256 requiredVerifications
    );
    
    event AchievementApproved(
        uint256 indexed tokenId,
        address indexed athlete,
        uint256 timestamp
    );
    
    event AchievementRejected(
        uint256 indexed tokenId,
        address indexed athlete,
        string reason
    );
    
    event VerifierAdded(
        address indexed verifier,
        uint256 weight,
        string expertise
    );
    
    event VerifierUpdated(
        address indexed verifier,
        uint256 oldWeight,
        uint256 newWeight
    );
    
    event VerifierRemoved(
        address indexed verifier
    );
    
    event DisputeRaised(
        uint256 indexed tokenId,
        address indexed disputer,
        string reason
    );

    // 修饰符
    modifier onlyVerifiedAthlete() {
        require(
            athleteRegistry.isRegistered(msg.sender),
            "AchievementTracker: Not registered athlete"
        );
        
        AthleteRegistry.AthleteProfile memory profile = athleteRegistry.getAthleteProfile(msg.sender);
        require(
            profile.status == AthleteRegistry.AthleteStatus.Verified,
            "AchievementTracker: Athlete not verified"
        );
        _;
    }
    
    modifier onlyActiveVerifier() {
        require(
            verifierWeights[msg.sender].isActive,
            "AchievementTracker: Not authorized verifier"
        );
        _;
    }
    
    modifier validTokenId(uint256 _tokenId) {
        require(_ownerOf(_tokenId) != address(0), "AchievementTracker: Token does not exist");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化合约
     * @param _owner 合约所有者
     * @param _athleteRegistry 运动员注册合约地址
     * @param _submissionFee 提交费用
     * @param _verificationReward 验证奖励
     */
    function initialize(
        address _owner,
        address _athleteRegistry,
        uint256 _submissionFee,
        uint256 _verificationReward
    ) public initializer {
        require(_athleteRegistry != address(0), "AchievementTracker: Invalid registry address");
        
        __ERC721_init("FrisbeDAO Achievement", "FDA");
        __ERC721URIStorage_init();
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        athleteRegistry = AthleteRegistry(_athleteRegistry);
        submissionFee = _submissionFee;
        verificationReward = _verificationReward;
        
        // 设置默认验证要求
        requiredVerificationsByType[AchievementType.Competition] = 3;
        requiredVerificationsByType[AchievementType.Training] = 2;
        requiredVerificationsByType[AchievementType.Record] = 5;
        requiredVerificationsByType[AchievementType.Community] = 2;
        requiredVerificationsByType[AchievementType.Special] = 3;
    }

    /**
     * @dev 提交成就
     * @param _achievementType 成就类型
     * @param _title 成就标题
     * @param _description 成就描述
     * @param _metadataURI 元数据URI
     * @param _timestamp 成就时间戳
     * @param _evidenceURIs 证据URI列表
     */
    function submitAchievement(
        AchievementType _achievementType,
        string calldata _title,
        string calldata _description,
        string calldata _metadataURI,
        uint256 _timestamp,
        string[] calldata _evidenceURIs
    ) external payable onlyVerifiedAthlete nonReentrant {
        require(msg.value >= submissionFee, "AchievementTracker: Insufficient submission fee");
        require(bytes(_title).length > 0, "AchievementTracker: Title cannot be empty");
        require(bytes(_description).length > 0, "AchievementTracker: Description cannot be empty");
        require(_timestamp <= block.timestamp, "AchievementTracker: Invalid timestamp");
        require(_evidenceURIs.length > 0, "AchievementTracker: Evidence required");
        
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        
        // 铸造NFT给运动员
        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, _metadataURI);
        
        // 创建成就记录
        Achievement storage achievement = achievements[newTokenId];
        achievement.tokenId = newTokenId;
        achievement.athlete = msg.sender;
        achievement.achievementType = _achievementType;
        achievement.title = _title;
        achievement.description = _description;
        achievement.metadataURI = _metadataURI;
        achievement.timestamp = _timestamp;
        achievement.submissionTime = block.timestamp;
        achievement.status = AchievementStatus.Pending;
        achievement.verificationCount = 0;
        achievement.requiredVerifications = requiredVerificationsByType[_achievementType];
        
        // 存储证据URI
        for (uint256 i = 0; i < _evidenceURIs.length; i++) {
            achievement.evidenceURIs.push(_evidenceURIs[i]);
        }
        
        athleteAchievements[msg.sender].push(newTokenId);
        allAchievements.push(newTokenId);
        
        emit AchievementSubmitted(
            newTokenId,
            msg.sender,
            _achievementType,
            _title,
            _timestamp
        );
        
        // 退还多余费用
        if (msg.value > submissionFee) {
            payable(msg.sender).transfer(msg.value - submissionFee);
        }
    }

    /**
     * @dev 验证成就
     * @param _tokenId NFT Token ID
     * @param _approved 是否批准
     * @param _comments 验证评论
     */
    function verifyAchievement(
        uint256 _tokenId,
        bool _approved,
        string calldata _comments
    ) external onlyActiveVerifier validTokenId(_tokenId) nonReentrant {
        Achievement storage achievement = achievements[_tokenId];
        
        require(
            achievement.status == AchievementStatus.Pending,
            "AchievementTracker: Achievement not pending"
        );
        
        require(
            !achievement.hasVerified[msg.sender],
            "AchievementTracker: Already verified by this verifier"
        );
        
        require(
            achievement.verifiers.length < MAX_VERIFIERS_PER_ACHIEVEMENT,
            "AchievementTracker: Max verifiers reached"
        );
        
        // 记录验证
        achievement.hasVerified[msg.sender] = true;
        achievement.verifiers.push(msg.sender);
        
        if (_approved) {
            uint256 verifierWeight = verifierWeights[msg.sender].weight;
            achievement.verificationCount += verifierWeight;
        }
        
        emit AchievementVerified(
            _tokenId,
            msg.sender,
            achievement.verificationCount,
            achievement.requiredVerifications
        );
        
        // 检查是否达到验证要求
        if (achievement.verificationCount >= achievement.requiredVerifications) {
            achievement.status = AchievementStatus.Verified;
            
            // 更新运动员注册合约中的成就数量
            athleteRegistry.incrementAchievementCount(achievement.athlete);
            
            emit AchievementApproved(_tokenId, achievement.athlete, block.timestamp);
        }
        
        // 发放验证奖励
        if (verificationReward > 0 && address(this).balance >= verificationReward) {
            payable(msg.sender).transfer(verificationReward);
        }
    }

    /**
     * @dev 拒绝成就
     * @param _tokenId NFT Token ID
     * @param _reason 拒绝原因
     */
    function rejectAchievement(
        uint256 _tokenId,
        string calldata _reason
    ) external onlyOwner validTokenId(_tokenId) {
        Achievement storage achievement = achievements[_tokenId];
        
        require(
            achievement.status == AchievementStatus.Pending,
            "AchievementTracker: Achievement not pending"
        );
        
        achievement.status = AchievementStatus.Rejected;
        
        emit AchievementRejected(_tokenId, achievement.athlete, _reason);
    }

    /**
     * @dev 提起争议
     * @param _tokenId NFT Token ID
     * @param _reason 争议原因
     */
    function raiseDispute(
        uint256 _tokenId,
        string calldata _reason
    ) external validTokenId(_tokenId) {
        Achievement storage achievement = achievements[_tokenId];
        
        require(
            achievement.status == AchievementStatus.Verified ||
            achievement.status == AchievementStatus.Rejected,
            "AchievementTracker: Invalid status for dispute"
        );
        
        require(
            msg.sender == achievement.athlete || verifierWeights[msg.sender].isActive,
            "AchievementTracker: Not authorized to dispute"
        );
        
        achievement.status = AchievementStatus.Disputed;
        
        emit DisputeRaised(_tokenId, msg.sender, _reason);
    }

    /**
     * @dev 添加验证者
     * @param _verifier 验证者地址
     * @param _weight 验证权重
     * @param _expertise 专业领域
     */
    function addVerifier(
        address _verifier,
        uint256 _weight,
        string calldata _expertise
    ) external onlyOwner {
        require(_verifier != address(0), "AchievementTracker: Invalid verifier address");
        require(
            _weight >= MIN_VERIFICATION_WEIGHT && _weight <= MAX_VERIFICATION_WEIGHT,
            "AchievementTracker: Invalid weight"
        );
        require(!verifierWeights[_verifier].isActive, "AchievementTracker: Verifier already exists");
        
        verifierWeights[_verifier] = VerifierWeight({
            weight: _weight,
            isActive: true,
            expertise: _expertise
        });
        
        verifierList.push(_verifier);
        
        emit VerifierAdded(_verifier, _weight, _expertise);
    }

    /**
     * @dev 更新验证者权重
     * @param _verifier 验证者地址
     * @param _newWeight 新权重
     */
    function updateVerifierWeight(
        address _verifier,
        uint256 _newWeight
    ) external onlyOwner {
        require(verifierWeights[_verifier].isActive, "AchievementTracker: Verifier not found");
        require(
            _newWeight >= MIN_VERIFICATION_WEIGHT && _newWeight <= MAX_VERIFICATION_WEIGHT,
            "AchievementTracker: Invalid weight"
        );
        
        uint256 oldWeight = verifierWeights[_verifier].weight;
        verifierWeights[_verifier].weight = _newWeight;
        
        emit VerifierUpdated(_verifier, oldWeight, _newWeight);
    }

    /**
     * @dev 移除验证者
     * @param _verifier 验证者地址
     */
    function removeVerifier(address _verifier) external onlyOwner {
        require(verifierWeights[_verifier].isActive, "AchievementTracker: Verifier not found");
        
        verifierWeights[_verifier].isActive = false;
        
        emit VerifierRemoved(_verifier);
    }

    /**
     * @dev 设置成就类型的验证要求
     * @param _achievementType 成就类型
     * @param _requiredVerifications 所需验证数量
     */
    function setRequiredVerifications(
        AchievementType _achievementType,
        uint256 _requiredVerifications
    ) external onlyOwner {
        require(_requiredVerifications > 0, "AchievementTracker: Invalid verification count");
        
        requiredVerificationsByType[_achievementType] = _requiredVerifications;
    }

    /**
     * @dev 设置提交费用
     * @param _newSubmissionFee 新的提交费用
     */
    function setSubmissionFee(uint256 _newSubmissionFee) external onlyOwner {
        submissionFee = _newSubmissionFee;
    }

    /**
     * @dev 设置验证奖励
     * @param _newVerificationReward 新的验证奖励
     */
    function setVerificationReward(uint256 _newVerificationReward) external onlyOwner {
        verificationReward = _newVerificationReward;
    }

    /**
     * @dev 提取合约余额
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "AchievementTracker: No funds to withdraw");
        
        payable(owner()).transfer(balance);
    }

    // 查询函数
    function getAchievement(uint256 _tokenId) external view validTokenId(_tokenId) returns (
        uint256 tokenId,
        address athlete,
        AchievementType achievementType,
        string memory title,
        string memory description,
        string memory metadataURI,
        uint256 timestamp,
        uint256 submissionTime,
        AchievementStatus status,
        address[] memory verifiers,
        uint256 verificationCount,
        uint256 requiredVerifications
    ) {
        Achievement storage achievement = achievements[_tokenId];
        return (
            achievement.tokenId,
            achievement.athlete,
            achievement.achievementType,
            achievement.title,
            achievement.description,
            achievement.metadataURI,
            achievement.timestamp,
            achievement.submissionTime,
            achievement.status,
            achievement.verifiers,
            achievement.verificationCount,
            achievement.requiredVerifications
        );
    }

    function getAchievementEvidence(uint256 _tokenId) external view validTokenId(_tokenId) returns (string[] memory) {
        return achievements[_tokenId].evidenceURIs;
    }

    function getAthleteAchievements(address _athlete) external view returns (uint256[] memory) {
        return athleteAchievements[_athlete];
    }

    function getAllAchievements() external view returns (uint256[] memory) {
        return allAchievements;
    }

    function getVerifierList() external view returns (address[] memory) {
        return verifierList;
    }

    function getTotalAchievements() external view returns (uint256) {
        return _tokenIdCounter;
    }

    function hasVerified(uint256 _tokenId, address _verifier) external view validTokenId(_tokenId) returns (bool) {
        return achievements[_tokenId].hasVerified[_verifier];
    }

    // 重写函数
    function tokenURI(uint256 tokenId) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // _burn函数在新版本OpenZeppelin中不需要override
    // function _burn(uint256 tokenId) internal override {
    //     super._burn(tokenId);
    // }

    /**
     * @dev 授权升级函数
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev 接收ETH
     */
    receive() external payable {}
}