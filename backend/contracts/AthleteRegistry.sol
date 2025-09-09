// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title AthleteRegistry
 * @dev 运动员注册管理合约，支持身份验证、个人资料存储和声誉评分系统
 */
contract AthleteRegistry is 
    Initializable, 
    OwnableUpgradeable, 
    UUPSUpgradeable, 
    ReentrancyGuardUpgradeable,
    PausableUpgradeable 
{
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using Address for address payable;

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

    // 用户等级信息结构体
    struct UserLevel {
        uint256 cumulativeInvestment;  // 累计投资金额
        uint8 currentLevel;            // 当前等级 (1-10)
        uint256 lastUpdateTime;       // 最后更新时间
        uint256 totalTokensPurchased; // 累计购买代币数量
    }

    // 等级配置结构体
    struct LevelConfig {
        uint256 requiredInvestment;   // 所需投资金额
        uint256 discountPercentage;   // 折扣百分比 (basis points, 100 = 1%)
        string levelName;             // 等级名称
        bool isActive;                // 是否激活
    }

    // 状态变量
    mapping(address => AthleteProfile) public athletes;
    mapping(address => Verifier) public verifiers;
    mapping(address => bool) public isRegistered;
    
    // 等级系统相关映射
    mapping(address => mapping(address => UserLevel)) public userLevels; // user => athlete => level
    mapping(uint8 => LevelConfig) public levelConfigs; // level => config
    mapping(address => uint256) public athleteTotalInvestment; // athlete => total investment received
    
    address[] public athleteList;
    address[] public verifierList;
    
    // 常量定義 - 使用 immutable 和 constant 優化 Gas
    uint256 public constant MAX_REPUTATION_SCORE = 1000;
    uint256 public constant MIN_REPUTATION_SCORE = 0;
    uint256 public constant MIN_LEVEL = 1;
    uint256 public constant MAX_LEVEL = 10;
    uint256 public constant INITIAL_REPUTATION_SCORE = 500; // 初始聲譽分數
    uint256 public constant REPUTATION_DECAY_PERIOD = 30 days; // 聲譽衰減週期
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
    
    event LevelUpdated(
        address indexed user,
        address indexed athlete,
        uint8 oldLevel,
        uint8 newLevel,
        uint256 cumulativeInvestment
    );
    
    event LevelConfigUpdated(
        uint8 indexed level,
        uint256 requiredInvestment,
        uint256 discountPercentage,
        string levelName
    );
    
    event InvestmentRecorded(
        address indexed user,
        address indexed athlete,
        uint256 amount,
        uint256 tokensPurchased
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
        __Pausable_init();
        
        registrationFee = _registrationFee;
        
        // 初始化等级配置
        _initializeLevelConfigs();
    }
    
    /**
     * @dev 初始化等级配置
     */
    function _initializeLevelConfigs() private {
        // Level 1: 0 ETH, 0% discount
        levelConfigs[1] = LevelConfig({
            requiredInvestment: 0,
            discountPercentage: 0,
            levelName: "Bronze",
            isActive: true
        });
        
        // Level 2: 0.1 ETH, 1% discount
        levelConfigs[2] = LevelConfig({
            requiredInvestment: 0.1 ether,
            discountPercentage: 100,
            levelName: "Silver",
            isActive: true
        });
        
        // Level 3: 0.5 ETH, 2% discount
        levelConfigs[3] = LevelConfig({
            requiredInvestment: 0.5 ether,
            discountPercentage: 200,
            levelName: "Gold",
            isActive: true
        });
        
        // Level 4: 1 ETH, 3% discount
        levelConfigs[4] = LevelConfig({
            requiredInvestment: 1 ether,
            discountPercentage: 300,
            levelName: "Platinum",
            isActive: true
        });
        
        // Level 5: 2.5 ETH, 5% discount
        levelConfigs[5] = LevelConfig({
            requiredInvestment: 2.5 ether,
            discountPercentage: 500,
            levelName: "Diamond",
            isActive: true
        });
        
        // Level 6-10: Higher tiers
        levelConfigs[6] = LevelConfig(5 ether, 750, "Master", true);
        levelConfigs[7] = LevelConfig(10 ether, 1000, "Grandmaster", true);
        levelConfigs[8] = LevelConfig(25 ether, 1250, "Champion", true);
        levelConfigs[9] = LevelConfig(50 ether, 1500, "Legend", true);
        levelConfigs[10] = LevelConfig(100 ether, 2000, "Mythic", true);
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
    ) external payable nonReentrant whenNotPaused {
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
        
        // 安全地退还多余费用
        if (msg.value > registrationFee) {
            payable(msg.sender).sendValue(msg.value - registrationFee);
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
     * @dev 记录用户投资并更新等级
     * @param _user 投资用户地址
     * @param _athlete 运动员地址
     * @param _investmentAmount 投资金额
     * @param _tokensPurchased 购买的代币数量
     */
    function recordInvestment(
        address _user,
        address _athlete,
        uint256 _investmentAmount,
        uint256 _tokensPurchased
    ) external {
        // 只允许代币工厂合约调用
        require(
            msg.sender == owner() || verifiers[msg.sender].isActive,
            "AthleteRegistry: Unauthorized caller"
        );
        require(isRegistered[_athlete], "AthleteRegistry: Athlete not registered");
        require(_user != address(0), "AthleteRegistry: Invalid user address");
        require(_investmentAmount > 0, "AthleteRegistry: Investment amount must be positive");
        
        // 更新用户等级信息
        UserLevel storage userLevel = userLevels[_user][_athlete];
        uint8 oldLevel = userLevel.currentLevel;
        
        // 如果是首次投资，初始化为等级1
        if (userLevel.lastUpdateTime == 0) {
            userLevel.currentLevel = 1;
        }
        
        // 更新累计投资和代币购买量
        userLevel.cumulativeInvestment += _investmentAmount;
        userLevel.totalTokensPurchased += _tokensPurchased;
        userLevel.lastUpdateTime = block.timestamp;
        
        // 更新运动员总投资额
        athleteTotalInvestment[_athlete] += _investmentAmount;
        
        // 计算新等级
        uint8 newLevel = _calculateUserLevel(userLevel.cumulativeInvestment);
        userLevel.currentLevel = newLevel;
        
        // 发出事件
        emit InvestmentRecorded(_user, _athlete, _investmentAmount, _tokensPurchased);
        
        if (oldLevel != newLevel) {
            emit LevelUpdated(_user, _athlete, oldLevel, newLevel, userLevel.cumulativeInvestment);
        }
    }
    
    /**
     * @dev 计算用户等级
     * @param _cumulativeInvestment 累计投资金额
     * @return level 用户等级
     */
    function _calculateUserLevel(uint256 _cumulativeInvestment) private view returns (uint8 level) {
        level = 1; // 默认等级1
        
        // 从高等级往低等级检查
        for (uint8 i = uint8(MAX_LEVEL); i >= MIN_LEVEL; i--) {
            if (levelConfigs[i].isActive && _cumulativeInvestment >= levelConfigs[i].requiredInvestment) {
                level = i;
                break;
            }
        }
    }
    
    /**
     * @dev 获取用户对特定运动员的等级信息
     * @param _user 用户地址
     * @param _athlete 运动员地址
     * @return userLevel 用户等级信息
     */
    function getUserLevel(address _user, address _athlete) external view returns (UserLevel memory userLevel) {
        userLevel = userLevels[_user][_athlete];
        
        // 如果从未投资，返回默认等级1
        if (userLevel.lastUpdateTime == 0) {
            userLevel.currentLevel = 1;
        }
    }
    
    /**
     * @dev 获取用户当前等级的折扣百分比
     * @param _user 用户地址
     * @param _athlete 运动员地址
     * @return discountPercentage 折扣百分比 (basis points)
     */
    function getUserDiscount(address _user, address _athlete) external view returns (uint256 discountPercentage) {
        UserLevel memory userLevel = userLevels[_user][_athlete];
        uint8 level = userLevel.currentLevel;
        
        if (level == 0) {
            level = 1; // 默认等级1
        }
        
        return levelConfigs[level].discountPercentage;
    }
    
    /**
     * @dev 更新等级配置
     * @param _level 等级
     * @param _requiredInvestment 所需投资金额
     * @param _discountPercentage 折扣百分比
     * @param _levelName 等级名称
     */
    function updateLevelConfig(
        uint8 _level,
        uint256 _requiredInvestment,
        uint256 _discountPercentage,
        string calldata _levelName
    ) external onlyOwner {
        require(_level >= MIN_LEVEL && _level <= MAX_LEVEL, "AthleteRegistry: Invalid level");
        require(_discountPercentage <= 5000, "AthleteRegistry: Discount too high"); // 最大50%折扣
        
        levelConfigs[_level] = LevelConfig({
            requiredInvestment: _requiredInvestment,
            discountPercentage: _discountPercentage,
            levelName: _levelName,
            isActive: true
        });
        
        emit LevelConfigUpdated(_level, _requiredInvestment, _discountPercentage, _levelName);
    }
    
    /**
     * @dev 启用/禁用等级
     * @param _level 等级
     * @param _isActive 是否激活
     */
    function setLevelActive(uint8 _level, bool _isActive) external onlyOwner {
        require(_level >= MIN_LEVEL && _level <= MAX_LEVEL, "AthleteRegistry: Invalid level");
        levelConfigs[_level].isActive = _isActive;
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
     * @dev 获取等级配置
     * @param _level 等级
     * @return config 等级配置
     */
    function getLevelConfig(uint8 _level) external view returns (LevelConfig memory config) {
        require(_level >= MIN_LEVEL && _level <= MAX_LEVEL, "AthleteRegistry: Invalid level");
        return levelConfigs[_level];
    }
    
    /**
     * @dev 获取运动员总投资额
     * @param _athlete 运动员地址
     * @return totalInvestment 总投资额
     */
    function getAthleteTotalInvestment(address _athlete) external view returns (uint256 totalInvestment) {
        return athleteTotalInvestment[_athlete];
    }
    
    /**
     * @dev 批量获取用户在多个运动员的等级信息
     * @param _user 用户地址
     * @param _athletes 运动员地址数组
     * @return levels 等级信息数组
     */
    function getUserLevelsBatch(address _user, address[] calldata _athletes) 
        external view returns (UserLevel[] memory levels) {
        uint256 length = _athletes.length; // 緩存數組長度減少重複讀取
        levels = new UserLevel[](length);
        
        // 使用 unchecked 塊優化循環 Gas 消耗
        unchecked {
            for (uint256 i = 0; i < length; ++i) {
                levels[i] = userLevels[_user][_athletes[i]];
                
                // 如果从未投资，设置默认等级1
                if (levels[i].lastUpdateTime == 0) {
                    levels[i].currentLevel = 1;
                }
            }
        }
    }
    
    /**
     * @dev 获取所有等级配置
     * @return configs 所有等级配置数组
     */
    function getAllLevelConfigs() external view returns (LevelConfig[] memory configs) {
        configs = new LevelConfig[](MAX_LEVEL);
        
        for (uint8 i = 1; i <= MAX_LEVEL; i++) {
            configs[i-1] = levelConfigs[i];
        }
    }

    /**
     * @dev 緊急暫停功能 - 安全機制
     */
    function emergencyPause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev 恢復合約運行
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev 提取合約餘額 - 僅限緊急情況
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "AthleteRegistry: No funds to withdraw");
        
        payable(owner()).sendValue(balance);
    }
    
    /**
     * @dev 授权升级函数
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}