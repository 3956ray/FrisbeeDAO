// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title AthleteRegistry
 * @dev 运动员注册管理合约，支持身份验证、个人资料存储和声誉评分系统
 */
contract AthleteRegistry is 
    Initializable, 
    OwnableUpgradeable, 
    UUPSUpgradeable, 
    ReentrancyGuardUpgradeable 
{
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // 运动员状态枚举
    enum AthleteStatus {
        Pending,    // 待审核
        Verified,   // 已验证
        Suspended,  // 暂停
        Banned      // 禁用
    }

    // 运动员信息结构体
    struct AthleteProfile {
        string name;                // 姓名
        string sport;              // 运动项目
        string ipfsHash;           // IPFS哈希存储详细信息
        uint256 reputationScore;   // 声誉评分 (0-1000)
        uint256 registrationTime;  // 注册时间
        AthleteStatus status;      // 状态
        address verifier;          // 验证者地址
        uint256 achievementCount;  // 成就数量
    }

    // 验证者信息结构体
    struct Verifier {
        bool isActive;
        string organization;
        uint256 verificationCount;
    }

    // 状态变量
    mapping(address => AthleteProfile) public athletes;
    mapping(address => Verifier) public verifiers;
    mapping(address => bool) public isRegistered;
    
    address[] public athleteList;
    address[] public verifierList;
    
    uint256 public constant MAX_REPUTATION_SCORE = 1000;
    uint256 public constant MIN_REPUTATION_SCORE = 0;
    uint256 public registrationFee;
    
    // 事件定义
    event AthleteRegistered(
        address indexed athlete,
        string name,
        string sport,
        uint256 timestamp
    );
    
    event AthleteVerified(
        address indexed athlete,
        address indexed verifier,
        uint256 timestamp
    );
    
    event AthleteStatusChanged(
        address indexed athlete,
        AthleteStatus oldStatus,
        AthleteStatus newStatus,
        uint256 timestamp
    );
    
    event ReputationUpdated(
        address indexed athlete,
        uint256 oldScore,
        uint256 newScore,
        string reason
    );
    
    event VerifierAdded(
        address indexed verifier,
        string organization
    );
    
    event VerifierRemoved(
        address indexed verifier
    );
    
    event ProfileUpdated(
        address indexed athlete,
        string ipfsHash
    );

    // 修饰符
    modifier onlyRegisteredAthlete() {
        require(isRegistered[msg.sender], "AthleteRegistry: Not registered");
        _;
    }
    
    modifier onlyVerifier() {
        require(verifiers[msg.sender].isActive, "AthleteRegistry: Not authorized verifier");
        _;
    }
    
    modifier onlyVerifiedAthlete(address athlete) {
        require(
            athletes[athlete].status == AthleteStatus.Verified,
            "AthleteRegistry: Athlete not verified"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化合约
     * @param _owner 合约所有者地址
     * @param _registrationFee 注册费用
     */
    function initialize(
        address _owner,
        uint256 _registrationFee
    ) public initializer {
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        registrationFee = _registrationFee;
    }

    /**
     * @dev 运动员注册
     * @param _name 姓名
     * @param _sport 运动项目
     * @param _ipfsHash IPFS哈希
     */
    function registerAthlete(
        string calldata _name,
        string calldata _sport,
        string calldata _ipfsHash
    ) external payable nonReentrant {
        require(!isRegistered[msg.sender], "AthleteRegistry: Already registered");
        require(msg.value >= registrationFee, "AthleteRegistry: Insufficient fee");
        require(bytes(_name).length > 0, "AthleteRegistry: Name cannot be empty");
        require(bytes(_sport).length > 0, "AthleteRegistry: Sport cannot be empty");
        
        athletes[msg.sender] = AthleteProfile({
            name: _name,
            sport: _sport,
            ipfsHash: _ipfsHash,
            reputationScore: 500, // 初始声誉评分
            registrationTime: block.timestamp,
            status: AthleteStatus.Pending,
            verifier: address(0),
            achievementCount: 0
        });
        
        isRegistered[msg.sender] = true;
        athleteList.push(msg.sender);
        
        emit AthleteRegistered(msg.sender, _name, _sport, block.timestamp);
        
        // 退还多余费用
        if (msg.value > registrationFee) {
            payable(msg.sender).transfer(msg.value - registrationFee);
        }
    }

    /**
     * @dev 验证运动员身份
     * @param _athlete 运动员地址
     */
    function verifyAthlete(address _athlete) external onlyVerifier {
        require(isRegistered[_athlete], "AthleteRegistry: Athlete not registered");
        require(
            athletes[_athlete].status == AthleteStatus.Pending,
            "AthleteRegistry: Athlete already processed"
        );
        
        AthleteStatus oldStatus = athletes[_athlete].status;
        athletes[_athlete].status = AthleteStatus.Verified;
        athletes[_athlete].verifier = msg.sender;
        
        verifiers[msg.sender].verificationCount++;
        
        emit AthleteVerified(_athlete, msg.sender, block.timestamp);
        emit AthleteStatusChanged(_athlete, oldStatus, AthleteStatus.Verified, block.timestamp);
    }

    /**
     * @dev 更新运动员状态
     * @param _athlete 运动员地址
     * @param _status 新状态
     */
    function updateAthleteStatus(
        address _athlete,
        AthleteStatus _status
    ) external onlyOwner {
        require(isRegistered[_athlete], "AthleteRegistry: Athlete not registered");
        
        AthleteStatus oldStatus = athletes[_athlete].status;
        athletes[_athlete].status = _status;
        
        emit AthleteStatusChanged(_athlete, oldStatus, _status, block.timestamp);
    }

    /**
     * @dev 更新声誉评分
     * @param _athlete 运动员地址
     * @param _newScore 新评分
     * @param _reason 更新原因
     */
    function updateReputationScore(
        address _athlete,
        uint256 _newScore,
        string calldata _reason
    ) external onlyVerifier {
        require(isRegistered[_athlete], "AthleteRegistry: Athlete not registered");
        require(
            _newScore >= MIN_REPUTATION_SCORE && _newScore <= MAX_REPUTATION_SCORE,
            "AthleteRegistry: Invalid score range"
        );
        
        uint256 oldScore = athletes[_athlete].reputationScore;
        athletes[_athlete].reputationScore = _newScore;
        
        emit ReputationUpdated(_athlete, oldScore, _newScore, _reason);
    }

    /**
     * @dev 更新个人资料
     * @param _ipfsHash 新的IPFS哈希
     */
    function updateProfile(string calldata _ipfsHash) external onlyRegisteredAthlete {
        athletes[msg.sender].ipfsHash = _ipfsHash;
        emit ProfileUpdated(msg.sender, _ipfsHash);
    }

    /**
     * @dev 增加成就数量
     * @param _athlete 运动员地址
     */
    function incrementAchievementCount(address _athlete) external {
        // 只允许成就追踪合约调用
        require(
            msg.sender == owner() || verifiers[msg.sender].isActive,
            "AthleteRegistry: Unauthorized"
        );
        require(isRegistered[_athlete], "AthleteRegistry: Athlete not registered");
        
        athletes[_athlete].achievementCount++;
    }

    /**
     * @dev 添加验证者
     * @param _verifier 验证者地址
     * @param _organization 组织名称
     */
    function addVerifier(
        address _verifier,
        string calldata _organization
    ) external onlyOwner {
        require(_verifier != address(0), "AthleteRegistry: Invalid verifier address");
        require(!verifiers[_verifier].isActive, "AthleteRegistry: Verifier already exists");
        
        verifiers[_verifier] = Verifier({
            isActive: true,
            organization: _organization,
            verificationCount: 0
        });
        
        verifierList.push(_verifier);
        emit VerifierAdded(_verifier, _organization);
    }

    /**
     * @dev 移除验证者
     * @param _verifier 验证者地址
     */
    function removeVerifier(address _verifier) external onlyOwner {
        require(verifiers[_verifier].isActive, "AthleteRegistry: Verifier not found");
        
        verifiers[_verifier].isActive = false;
        emit VerifierRemoved(_verifier);
    }

    /**
     * @dev 设置注册费用
     * @param _newFee 新费用
     */
    function setRegistrationFee(uint256 _newFee) external onlyOwner {
        registrationFee = _newFee;
    }

    /**
     * @dev 提取合约余额
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "AthleteRegistry: No funds to withdraw");
        
        payable(owner()).transfer(balance);
    }

    // 查询函数
    function getAthleteProfile(address _athlete) external view returns (AthleteProfile memory) {
        require(isRegistered[_athlete], "AthleteRegistry: Athlete not registered");
        return athletes[_athlete];
    }

    function getVerifier(address _verifier) external view returns (Verifier memory) {
        return verifiers[_verifier];
    }

    function getAthleteCount() external view returns (uint256) {
        return athleteList.length;
    }

    function getVerifierCount() external view returns (uint256) {
        return verifierList.length;
    }

    function getAthleteList() external view returns (address[] memory) {
        return athleteList;
    }

    function getVerifierList() external view returns (address[] memory) {
        return verifierList;
    }

    /**
     * @dev 授权升级函数
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}