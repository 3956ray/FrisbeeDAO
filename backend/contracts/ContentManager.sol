// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./AthleteRegistry.sol";

/**
 * @title ContentManager
 * @dev 內容管理合約，處理付費內容、訪問權限和版權保護
 * @author FrisbeDAO Team
 */
contract ContentManager is 
    Initializable, 
    UUPSUpgradeable, 
    OwnableUpgradeable, 
    PausableUpgradeable,
    ReentrancyGuardUpgradeable 
{
    using Address for address payable;
    // 內容類型枚舉
    enum ContentType {
        VIDEO,          // 視頻
        ARTICLE,        // 文章
        LIVE_STREAM,    // 直播
        TRAINING_PLAN,  // 訓練計劃
        EXCLUSIVE_NEWS  // 獨家新聞
    }
    
    // 訪問級別枚舉
    enum AccessLevel {
        FREE,           // 免費
        PREMIUM,        // 付費
        VIP,            // VIP
        EXCLUSIVE       // 獨家
    }
    
    // 內容狀態枚舉
    enum ContentStatus {
        DRAFT,          // 草稿
        PUBLISHED,      // 已發布
        ARCHIVED,       // 已歸檔
        REMOVED         // 已移除
    }
    
    // 內容信息結構
    struct ContentInfo {
        uint256 contentId;          // 內容ID
        address creator;            // 創作者地址
        string title;               // 標題
        string description;         // 描述
        string contentHash;         // 內容哈希 (IPFS)
        string thumbnailHash;       // 縮略圖哈希
        ContentType contentType;    // 內容類型
        AccessLevel accessLevel;    // 訪問級別
        ContentStatus status;       // 內容狀態
        uint256 price;              // 價格 (wei)
        uint256 duration;           // 持續時間 (秒)
        uint256 createdAt;          // 創建時間
        uint256 updatedAt;          // 更新時間
        uint256 viewCount;          // 觀看次數
        uint256 likeCount;          // 點讚次數
        bool isLive;                // 是否為直播
    }
    
    // 訪問權限結構
    struct AccessPermission {
        uint256 contentId;          // 內容ID
        address user;               // 用戶地址
        uint256 purchaseTime;       // 購買時間
        uint256 expiryTime;         // 過期時間
        uint256 paidAmount;         // 支付金額
        bool isActive;              // 是否激活
    }
    
    // 創作者信息結構
    struct CreatorInfo {
        address creatorAddress;     // 創作者地址
        string name;                // 姓名
        string bio;                 // 簡介
        string avatarHash;          // 頭像哈希
        uint256 totalEarnings;      // 總收益
        uint256 contentCount;       // 內容數量
        uint256 followerCount;      // 粉絲數量
        bool isVerified;            // 是否認證
        bool isActive;              // 是否激活
    }
    
    // 訂閱計劃結構
    struct SubscriptionPlan {
        uint256 planId;             // 計劃ID
        address creator;            // 創作者
        string name;                // 計劃名稱
        string description;         // 描述
        uint256 price;              // 價格
        uint256 duration;           // 持續時間 (秒)
        AccessLevel accessLevel;    // 訪問級別
        bool isActive;              // 是否激活
    }
    
    // 狀態變量
    uint256 private _contentIdCounter;
    uint256 private _planIdCounter;
    
    mapping(uint256 => ContentInfo) public contents;                    // 內容ID => 內容信息
    mapping(address => CreatorInfo) public creators;                    // 創作者地址 => 創作者信息
    mapping(uint256 => SubscriptionPlan) public subscriptionPlans;     // 計劃ID => 訂閱計劃
    
    mapping(bytes32 => AccessPermission) public accessPermissions;     // 權限鍵 => 訪問權限
    mapping(address => uint256[]) public userContents;                  // 用戶 => 內容ID列表
    mapping(address => uint256[]) public creatorContents;               // 創作者 => 內容ID列表
    mapping(address => mapping(uint256 => bool)) public userSubscriptions; // 用戶 => 計劃ID => 是否訂閱
    
    mapping(address => bool) public authorizedCreators;                // 授權創作者
    mapping(address => bool) public contentModerators;                 // 內容審核員
    
    // 平台配置
    uint256 public platformFeePercentage;      // 平台手續費百分比 (basis points)
    uint256 public creatorFeePercentage;       // 創作者分成百分比
    address public feeRecipient;               // 手續費接收地址
    AthleteRegistry public athleteRegistry;     // 運動員註冊合約
    
    // 常量
    uint256 public constant MAX_PLATFORM_FEE = 2000;  // 最大平台手續費 20%
    uint256 public constant MIN_CONTENT_PRICE = 0.001 ether;
    uint256 public constant MAX_CONTENT_PRICE = 100 ether;
    
    // 事件
    event ContentCreated(
        uint256 indexed contentId,
        address indexed creator,
        string title,
        ContentType contentType,
        AccessLevel accessLevel,
        uint256 price
    );
    
    event ContentPurchased(
        uint256 indexed contentId,
        address indexed buyer,
        address indexed creator,
        uint256 amount,
        uint256 expiryTime
    );
    
    event ContentUpdated(
        uint256 indexed contentId,
        address indexed creator,
        ContentStatus status
    );
    
    event CreatorRegistered(
        address indexed creator,
        string name,
        bool isVerified
    );
    
    event SubscriptionPlanCreated(
        uint256 indexed planId,
        address indexed creator,
        string name,
        uint256 price,
        uint256 duration
    );
    
    event UserSubscribed(
        address indexed user,
        uint256 indexed planId,
        address indexed creator,
        uint256 amount,
        uint256 expiryTime
    );
    
    event ContentLiked(
        uint256 indexed contentId,
        address indexed user,
        uint256 newLikeCount
    );
    
    event CreatorEarningsWithdrawn(
        address indexed creator,
        uint256 amount
    );
    
    // 修飾符
    modifier onlyAuthorizedCreator() {
        require(
            authorizedCreators[msg.sender] || creators[msg.sender].isActive,
            "ContentManager: Not authorized creator"
        );
        _;
    }
    
    modifier onlyContentModerator() {
        require(
            contentModerators[msg.sender] || msg.sender == owner(),
            "ContentManager: Not authorized moderator"
        );
        _;
    }
    
    modifier validContentId(uint256 _contentId) {
        require(_contentId > 0 && _contentId <= _contentIdCounter, "ContentManager: Invalid content ID");
        _;
    }
    
    modifier onlyContentCreator(uint256 _contentId) {
        require(contents[_contentId].creator == msg.sender, "ContentManager: Not content creator");
        _;
    }
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev 初始化合約
     * @param _owner 合約擁有者
     * @param _feeRecipient 手續費接收地址
     * @param _platformFeePercentage 平台手續費百分比
     * @param _athleteRegistry 運動員註冊合約地址
     */
    function initialize(
        address _owner,
        address _feeRecipient,
        uint256 _platformFeePercentage,
        address _athleteRegistry
    ) public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        _transferOwnership(_owner);
        
        require(_feeRecipient != address(0), "ContentManager: Invalid fee recipient");
        require(_platformFeePercentage <= MAX_PLATFORM_FEE, "ContentManager: Fee too high");
        require(_athleteRegistry != address(0), "ContentManager: Invalid athlete registry");
        
        feeRecipient = _feeRecipient;
        platformFeePercentage = _platformFeePercentage;
        creatorFeePercentage = 10000 - _platformFeePercentage; // 剩餘部分給創作者
        athleteRegistry = AthleteRegistry(_athleteRegistry);
    }
    
    /**
     * @dev 註冊創作者
     * @param _name 姓名
     * @param _bio 簡介
     * @param _avatarHash 頭像哈希
     */
    function registerCreator(
        string memory _name,
        string memory _bio,
        string memory _avatarHash
    ) external whenNotPaused {
        require(bytes(_name).length > 0, "ContentManager: Invalid name");
        require(!creators[msg.sender].isActive, "ContentManager: Already registered");
        
        creators[msg.sender] = CreatorInfo({
            creatorAddress: msg.sender,
            name: _name,
            bio: _bio,
            avatarHash: _avatarHash,
            totalEarnings: 0,
            contentCount: 0,
            followerCount: 0,
            isVerified: false,
            isActive: true
        });
        
        emit CreatorRegistered(msg.sender, _name, false);
    }
    
    /**
     * @dev 創建內容
     * @param _title 標題
     * @param _description 描述
     * @param _contentHash 內容哈希
     * @param _thumbnailHash 縮略圖哈希
     * @param _contentType 內容類型
     * @param _accessLevel 訪問級別
     * @param _price 價格
     * @param _duration 持續時間
     */
    function createContent(
        string memory _title,
        string memory _description,
        string memory _contentHash,
        string memory _thumbnailHash,
        ContentType _contentType,
        AccessLevel _accessLevel,
        uint256 _price,
        uint256 _duration
    ) external onlyAuthorizedCreator whenNotPaused returns (uint256 contentId) {
        require(bytes(_title).length > 0, "ContentManager: Invalid title");
        require(bytes(_contentHash).length > 0, "ContentManager: Invalid content hash");
        
        if (_accessLevel != AccessLevel.FREE) {
            require(_price >= MIN_CONTENT_PRICE && _price <= MAX_CONTENT_PRICE, "ContentManager: Invalid price");
        }
        
        _contentIdCounter++;
        contentId = _contentIdCounter;
        
        contents[contentId] = ContentInfo({
            contentId: contentId,
            creator: msg.sender,
            title: _title,
            description: _description,
            contentHash: _contentHash,
            thumbnailHash: _thumbnailHash,
            contentType: _contentType,
            accessLevel: _accessLevel,
            status: ContentStatus.DRAFT,
            price: _price,
            duration: _duration,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            viewCount: 0,
            likeCount: 0,
            isLive: _contentType == ContentType.LIVE_STREAM
        });
        
        creatorContents[msg.sender].push(contentId);
        creators[msg.sender].contentCount++;
        
        emit ContentCreated(contentId, msg.sender, _title, _contentType, _accessLevel, _price);
    }
    
    /**
     * @dev 發布內容
     * @param _contentId 內容ID
     */
    function publishContent(uint256 _contentId) 
        external 
        validContentId(_contentId) 
        onlyContentCreator(_contentId) 
        whenNotPaused 
    {
        require(contents[_contentId].status == ContentStatus.DRAFT, "ContentManager: Not in draft status");
        
        contents[_contentId].status = ContentStatus.PUBLISHED;
        contents[_contentId].updatedAt = block.timestamp;
        
        emit ContentUpdated(_contentId, msg.sender, ContentStatus.PUBLISHED);
    }
    
    /**
     * @dev 購買內容訪問權限
     * @param _contentId 內容ID
     * @param _accessDuration 訪問持續時間 (秒)
     */
    function purchaseContent(uint256 _contentId, uint256 _accessDuration) 
        external 
        payable 
        validContentId(_contentId) 
        whenNotPaused 
        nonReentrant 
    {
        ContentInfo storage content = contents[_contentId];
        require(content.status == ContentStatus.PUBLISHED, "ContentManager: Content not published");
        require(content.accessLevel != AccessLevel.FREE, "ContentManager: Content is free");
        require(_accessDuration > 0, "ContentManager: Invalid access duration");
        
        // 獲取用戶等級以計算折扣
        uint256 finalPrice = content.price;
        if (address(athleteRegistry) != address(0)) {
            AthleteRegistry.UserLevel memory userLevel = athleteRegistry.getUserLevel(msg.sender, content.creator);
            if (userLevel.currentLevel > 0) {
                AthleteRegistry.LevelConfig memory levelConfig = athleteRegistry.getLevelConfig(userLevel.currentLevel);
                uint256 discount = (content.price * levelConfig.discountPercentage) / 10000;
                finalPrice = content.price - discount;
            }
        }
        
        require(msg.value >= finalPrice, "ContentManager: Insufficient payment");
        
        bytes32 permissionKey = keccak256(abi.encodePacked(_contentId, msg.sender));
        
        // 檢查是否已有有效訪問權限
        AccessPermission storage permission = accessPermissions[permissionKey];
        uint256 expiryTime = block.timestamp + _accessDuration;
        
        if (permission.isActive && permission.expiryTime > block.timestamp) {
            // 延長現有權限
            permission.expiryTime = permission.expiryTime + _accessDuration;
        } else {
            // 創建新權限
            accessPermissions[permissionKey] = AccessPermission({
                contentId: _contentId,
                user: msg.sender,
                purchaseTime: block.timestamp,
                expiryTime: expiryTime,
                paidAmount: finalPrice,
                isActive: true
            });
            
            userContents[msg.sender].push(_contentId);
        }
        
        // 分配收益
        uint256 platformFee = (finalPrice * platformFeePercentage) / 10000;
        uint256 creatorEarnings = finalPrice - platformFee;
        
        creators[content.creator].totalEarnings += creatorEarnings;
        
        // 使用 Address.sendValue 進行安全轉賬給創作者
        payable(content.creator).sendValue(creatorEarnings);
        
        // 轉賬平台手續費
        if (platformFee > 0) {
            payable(feeRecipient).sendValue(platformFee);
        }
        
        // 安全地退還多餘的ETH
        if (msg.value > finalPrice) {
            payable(msg.sender).sendValue(msg.value - finalPrice);
        }
        
        emit ContentPurchased(_contentId, msg.sender, content.creator, finalPrice, expiryTime);
    }
    
    /**
     * @dev 檢查用戶是否有內容訪問權限
     * @param _contentId 內容ID
     * @param _user 用戶地址
     * @return hasAccess 是否有訪問權限
     */
    function hasContentAccess(uint256 _contentId, address _user) 
        external 
        view 
        validContentId(_contentId) 
        returns (bool hasAccess) 
    {
        ContentInfo memory content = contents[_contentId];
        
        // 免費內容或創作者本人
        if (content.accessLevel == AccessLevel.FREE || content.creator == _user) {
            return true;
        }
        
        bytes32 permissionKey = keccak256(abi.encodePacked(_contentId, _user));
        AccessPermission memory permission = accessPermissions[permissionKey];
        
        return permission.isActive && permission.expiryTime > block.timestamp;
    }
    
    /**
     * @dev 點讚內容
     * @param _contentId 內容ID
     */
    function likeContent(uint256 _contentId) 
        external 
        validContentId(_contentId) 
        whenNotPaused 
    {
        require(contents[_contentId].status == ContentStatus.PUBLISHED, "ContentManager: Content not published");
        
        contents[_contentId].likeCount++;
        
        emit ContentLiked(_contentId, msg.sender, contents[_contentId].likeCount);
    }
    
    /**
     * @dev 增加觀看次數
     * @param _contentId 內容ID
     */
    function incrementViewCount(uint256 _contentId) 
        external 
        validContentId(_contentId) 
        whenNotPaused 
    {
        ContentInfo memory content = contents[_contentId];
        
        // 檢查訪問權限
        bool hasAccess = false;
        if (content.accessLevel == AccessLevel.FREE || content.creator == msg.sender) {
            hasAccess = true;
        } else {
            bytes32 permissionKey = keccak256(abi.encodePacked(_contentId, msg.sender));
            AccessPermission memory permission = accessPermissions[permissionKey];
            hasAccess = permission.isActive && permission.expiryTime > block.timestamp;
        }
        
        require(hasAccess, "ContentManager: No access to content");
        
        contents[_contentId].viewCount++;
    }
    
    /**
     * @dev 創建訂閱計劃
     * @param _name 計劃名稱
     * @param _description 描述
     * @param _price 價格
     * @param _duration 持續時間
     * @param _accessLevel 訪問級別
     */
    function createSubscriptionPlan(
        string memory _name,
        string memory _description,
        uint256 _price,
        uint256 _duration,
        AccessLevel _accessLevel
    ) external onlyAuthorizedCreator whenNotPaused returns (uint256 planId) {
        require(bytes(_name).length > 0, "ContentManager: Invalid plan name");
        require(_price >= MIN_CONTENT_PRICE, "ContentManager: Price too low");
        require(_duration > 0, "ContentManager: Invalid duration");
        
        _planIdCounter++;
        planId = _planIdCounter;
        
        subscriptionPlans[planId] = SubscriptionPlan({
            planId: planId,
            creator: msg.sender,
            name: _name,
            description: _description,
            price: _price,
            duration: _duration,
            accessLevel: _accessLevel,
            isActive: true
        });
        
        emit SubscriptionPlanCreated(planId, msg.sender, _name, _price, _duration);
    }
    
    /**
     * @dev 設置創作者授權狀態
     * @param _creator 創作者地址
     * @param _authorized 是否授權
     */
    function setCreatorAuthorization(address _creator, bool _authorized) 
        external 
        onlyOwner 
    {
        authorizedCreators[_creator] = _authorized;
    }
    
    /**
     * @dev 設置內容審核員
     * @param _moderator 審核員地址
     * @param _authorized 是否授權
     */
    function setContentModerator(address _moderator, bool _authorized) 
        external 
        onlyOwner 
    {
        contentModerators[_moderator] = _authorized;
    }
    
    /**
     * @dev 驗證創作者
     * @param _creator 創作者地址
     * @param _verified 是否驗證
     */
    function verifyCreator(address _creator, bool _verified) 
        external 
        onlyContentModerator 
    {
        require(creators[_creator].isActive, "ContentManager: Creator not active");
        creators[_creator].isVerified = _verified;
    }
    
    /**
     * @dev 設置平台手續費
     * @param _platformFeePercentage 平台手續費百分比
     */
    function setPlatformFee(uint256 _platformFeePercentage) 
        external 
        onlyOwner 
    {
        require(_platformFeePercentage <= MAX_PLATFORM_FEE, "ContentManager: Fee too high");
        platformFeePercentage = _platformFeePercentage;
        creatorFeePercentage = 10000 - _platformFeePercentage;
    }
    
    /**
     * @dev 獲取創作者內容列表
     * @param _creator 創作者地址
     * @return contentIds 內容ID列表
     */
    function getCreatorContents(address _creator) 
        external 
        view 
        returns (uint256[] memory contentIds) 
    {
        return creatorContents[_creator];
    }
    
    /**
     * @dev 獲取用戶購買的內容列表
     * @param _user 用戶地址
     * @return contentIds 內容ID列表
     */
    function getUserContents(address _user) 
        external 
        view 
        returns (uint256[] memory contentIds) 
    {
        return userContents[_user];
    }
    
    /**
     * @dev 獲取當前內容ID計數器
     * @return count 當前計數
     */
    function getCurrentContentId() external view returns (uint256 count) {
        return _contentIdCounter;
    }
    
    /**
     * @dev 暫停合約
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev 恢復合約
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev 授權升級
     * @param newImplementation 新實現地址
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyOwner 
    {}
    
    /**
     * @dev 獲取合約版本
     * @return version 版本號
     */
    function getVersion() external pure returns (string memory version) {
        return "1.0.0";
    }
    
    /**
     * @dev 接收 ETH
     */
    receive() external payable {
        // 允許接收 ETH
    }
}