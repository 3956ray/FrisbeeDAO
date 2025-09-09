// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title PriceOracle
 * @dev 價格預言機合約，提供外部價格數據和自動化價格更新功能
 * @author FrisbeDAO Team
 */
contract PriceOracle is 
    Initializable, 
    UUPSUpgradeable, 
    OwnableUpgradeable, 
    PausableUpgradeable,
    ReentrancyGuardUpgradeable 
{
    // 價格數據結構 - 優化存儲打包
    struct PriceData {
        uint128 price;          // 價格 (18 decimals) - 減少到128位足夠
        uint64 timestamp;       // 更新時間戳 - 64位足夠到2554年
        uint32 roundId;         // Chainlink round ID - 32位足夠
        bool isValid;           // 數據是否有效
        // 總共: 128 + 64 + 32 + 8 = 232位，節省24位存儲空間
    }
    
    // 價格源配置 - 優化存儲打包
    struct PriceFeed {
        address feedAddress;    // Chainlink 價格源地址 (160位)
        uint32 heartbeat;       // 心跳間隔 (秒) - 32位足夠136年
        uint16 deviation;       // 允許偏差 (basis points) - 16位足夠65535bp
        bool isActive;          // 是否激活 (8位)
        // 總共: 160 + 32 + 16 + 8 = 216位，節省40位存儲空間
    }
    
    // 批量更新配置
    struct BatchUpdateConfig {
        string[] symbols;       // 代幣符號列表
        uint256 maxGasPerUpdate; // 每次更新最大 gas
        uint256 updateInterval;  // 更新間隔
        bool autoUpdate;        // 是否自動更新
    }
    
    // 狀態變量
    mapping(string => PriceData) public priceData;      // 代幣符號 => 價格數據
    mapping(string => PriceFeed) public priceFeeds;     // 代幣符號 => 價格源
    mapping(address => bool) public authorizedUpdaters; // 授權更新者
    
    BatchUpdateConfig public batchConfig;
    uint256 public lastBatchUpdate;
    uint256 public constant PRICE_DECIMALS = 18;
    uint256 public constant MAX_PRICE_AGE = 3600; // 1小時
    
    // 事件
    event PriceUpdated(
        string indexed symbol,
        uint256 price,
        uint256 timestamp,
        uint256 roundId
    );
    
    event PriceFeedAdded(
        string indexed symbol,
        address feedAddress,
        uint256 heartbeat
    );
    
    event PriceFeedUpdated(
        string indexed symbol,
        address oldFeed,
        address newFeed
    );
    
    event BatchUpdateExecuted(
        uint256 timestamp,
        uint256 updatedCount,
        uint256 gasUsed
    );
    
    event UpdaterAuthorized(address indexed updater, bool authorized);
    
    // 修飾符
    modifier onlyAuthorizedUpdater() {
        require(
            authorizedUpdaters[msg.sender] || msg.sender == owner(),
            "PriceOracle: Not authorized updater"
        );
        _;
    }
    
    modifier validSymbol(string memory _symbol) {
        require(bytes(_symbol).length > 0, "PriceOracle: Invalid symbol");
        require(priceFeeds[_symbol].isActive, "PriceOracle: Feed not active");
        _;
    }
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev 初始化合約
     * @param _owner 合約擁有者
     */
    function initialize(address _owner) public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        _transferOwnership(_owner);
        
        // 初始化批量更新配置
        batchConfig.maxGasPerUpdate = 500000;
        batchConfig.updateInterval = 300; // 5分鐘
        batchConfig.autoUpdate = true;
    }
    
    /**
     * @dev 添加價格源
     * @param _symbol 代幣符號
     * @param _feedAddress Chainlink 價格源地址
     * @param _heartbeat 心跳間隔
     * @param _deviation 允許偏差
     */
    function addPriceFeed(
        string memory _symbol,
        address _feedAddress,
        uint256 _heartbeat,
        uint256 _deviation
    ) external onlyOwner {
        require(_feedAddress != address(0), "PriceOracle: Invalid feed address");
        require(_heartbeat > 0, "PriceOracle: Invalid heartbeat");
        require(_deviation <= 10000, "PriceOracle: Invalid deviation");
        
        priceFeeds[_symbol] = PriceFeed({
            feedAddress: _feedAddress,
            heartbeat: uint32(_heartbeat),
            deviation: uint16(_deviation),
            isActive: true
        });
        
        emit PriceFeedAdded(_symbol, _feedAddress, _heartbeat);
    }
    
    /**
     * @dev 更新價格源
     * @param _symbol 代幣符號
     * @param _feedAddress 新的價格源地址
     */
    function updatePriceFeed(
        string memory _symbol,
        address _feedAddress
    ) external onlyOwner validSymbol(_symbol) {
        require(_feedAddress != address(0), "PriceOracle: Invalid feed address");
        
        address oldFeed = priceFeeds[_symbol].feedAddress;
        priceFeeds[_symbol].feedAddress = _feedAddress;
        
        emit PriceFeedUpdated(_symbol, oldFeed, _feedAddress);
    }
    
    /**
     * @dev 設置價格源狀態
     * @param _symbol 代幣符號
     * @param _isActive 是否激活
     */
    function setPriceFeedActive(
        string memory _symbol,
        bool _isActive
    ) external onlyOwner {
        require(priceFeeds[_symbol].feedAddress != address(0), "PriceOracle: Feed not exists");
        priceFeeds[_symbol].isActive = _isActive;
    }
    
    /**
     * @dev 授權/取消授權更新者
     * @param _updater 更新者地址
     * @param _authorized 是否授權
     */
    function setAuthorizedUpdater(
        address _updater,
        bool _authorized
    ) external onlyOwner {
        require(_updater != address(0), "PriceOracle: Invalid updater");
        authorizedUpdaters[_updater] = _authorized;
        emit UpdaterAuthorized(_updater, _authorized);
    }
    
    /**
     * @dev 手動更新單個價格
     * @param _symbol 代幣符號
     */
    function updatePrice(string memory _symbol) 
        external 
        onlyAuthorizedUpdater 
        validSymbol(_symbol) 
        whenNotPaused 
    {
        _updateSinglePrice(_symbol);
    }
    
    /**
     * @dev 批量更新價格
     * @param _symbols 代幣符號列表
     */
    function batchUpdatePrices(string[] memory _symbols) 
        external 
        onlyAuthorizedUpdater 
        whenNotPaused 
        nonReentrant 
    {
        require(_symbols.length > 0, "PriceOracle: Empty symbols array");
        
        uint256 gasStart = gasleft();
        uint256 updatedCount = 0;
        
        for (uint256 i = 0; i < _symbols.length; i++) {
            if (priceFeeds[_symbols[i]].isActive) {
                try this.updatePrice(_symbols[i]) {
                    updatedCount++;
                } catch {
                    // 忽略單個更新失敗，繼續處理其他價格
                }
                
                // Gas 限制檢查
                if (gasleft() < batchConfig.maxGasPerUpdate) {
                    break;
                }
            }
        }
        
        uint256 gasUsed = gasStart - gasleft();
        lastBatchUpdate = block.timestamp;
        
        emit BatchUpdateExecuted(block.timestamp, updatedCount, gasUsed);
    }
    
    /**
     * @dev 內部函數：更新單個價格
     * @param _symbol 代幣符號
     */
    function _updateSinglePrice(string memory _symbol) internal {
        PriceFeed memory feed = priceFeeds[_symbol];
        
        // 模擬 Chainlink 價格獲取 (實際部署時需要替換為真實的 Chainlink 接口)
        // 這裡使用模擬數據進行演示
        uint256 mockPrice = _getMockPrice(_symbol);
        uint256 mockRoundId = block.timestamp;
        
        // 驗證價格數據
        require(mockPrice > 0, "PriceOracle: Invalid price data");
        
        // 檢查價格偏差
        if (priceData[_symbol].isValid) {
            uint256 oldPrice = priceData[_symbol].price;
            uint256 deviation = mockPrice > oldPrice 
                ? ((mockPrice - oldPrice) * 10000) / oldPrice
                : ((oldPrice - mockPrice) * 10000) / oldPrice;
                
            require(deviation <= feed.deviation, "PriceOracle: Price deviation too high");
        }
        
        // 更新價格數據 - 使用類型轉換適應新的數據類型
        priceData[_symbol] = PriceData({
            price: uint128(mockPrice),
            timestamp: uint64(block.timestamp),
            roundId: uint32(mockRoundId),
            isValid: true
        });
        
        emit PriceUpdated(_symbol, mockPrice, block.timestamp, mockRoundId);
    }
    
    /**
     * @dev 模擬價格獲取 (實際部署時替換為 Chainlink 接口)
     * @param _symbol 代幣符號
     * @return price 模擬價格
     */
    function _getMockPrice(string memory _symbol) internal view returns (uint256 price) {
        // 基於區塊時間戳和符號生成模擬價格
        bytes32 hash = keccak256(abi.encodePacked(_symbol, block.timestamp / 300));
        uint256 basePrice = 1000 * 10**PRICE_DECIMALS; // 基礎價格 1000
        uint256 variation = (uint256(hash) % 200) * 10**(PRICE_DECIMALS-2); // ±2% 變動
        
        if (uint256(hash) % 2 == 0) {
            price = basePrice + variation;
        } else {
            price = basePrice > variation ? basePrice - variation : basePrice;
        }
    }
    
    /**
     * @dev 獲取價格
     * @param _symbol 代幣符號
     * @return price 價格
     * @return timestamp 時間戳
     */
    function getPrice(string memory _symbol) 
        external 
        view 
        returns (uint256 price, uint256 timestamp) 
    {
        PriceData memory data = priceData[_symbol];
        require(data.isValid, "PriceOracle: Price not available");
        require(
            block.timestamp - data.timestamp <= MAX_PRICE_AGE,
            "PriceOracle: Price too old"
        );
        
        return (uint256(data.price), uint256(data.timestamp));
    }
    
    /**
     * @dev 獲取最新價格 (不檢查時效性)
     * @param _symbol 代幣符號
     * @return price 價格
     * @return timestamp 時間戳
     * @return isValid 是否有效
     */
    function getLatestPrice(string memory _symbol) 
        external 
        view 
        returns (uint256 price, uint256 timestamp, bool isValid) 
    {
        PriceData memory data = priceData[_symbol];
        return (uint256(data.price), uint256(data.timestamp), data.isValid);
    }
    
    /**
     * @dev 批量獲取價格
     * @param _symbols 代幣符號列表
     * @return prices 價格列表
     * @return timestamps 時間戳列表
     */
    function getBatchPrices(string[] memory _symbols) 
        external 
        view 
        returns (uint256[] memory prices, uint256[] memory timestamps) 
    {
        prices = new uint256[](_symbols.length);
        timestamps = new uint256[](_symbols.length);
        
        for (uint256 i = 0; i < _symbols.length; i++) {
            PriceData memory data = priceData[_symbols[i]];
            prices[i] = uint256(data.price);
            timestamps[i] = uint256(data.timestamp);
        }
    }
    
    /**
     * @dev 檢查價格是否需要更新
     * @param _symbol 代幣符號
     * @return needsUpdate 是否需要更新
     */
    function needsPriceUpdate(string memory _symbol) 
        external 
        view 
        returns (bool needsUpdate) 
    {
        if (!priceFeeds[_symbol].isActive) return false;
        
        PriceData memory data = priceData[_symbol];
        if (!data.isValid) return true;
        
        uint256 timeSinceUpdate = block.timestamp - data.timestamp;
        return timeSinceUpdate >= priceFeeds[_symbol].heartbeat;
    }
    
    /**
     * @dev 設置批量更新配置
     * @param _symbols 代幣符號列表
     * @param _maxGasPerUpdate 每次更新最大 gas
     * @param _updateInterval 更新間隔
     * @param _autoUpdate 是否自動更新
     */
    function setBatchUpdateConfig(
        string[] memory _symbols,
        uint256 _maxGasPerUpdate,
        uint256 _updateInterval,
        bool _autoUpdate
    ) external onlyOwner {
        require(_maxGasPerUpdate > 0, "PriceOracle: Invalid max gas");
        require(_updateInterval > 0, "PriceOracle: Invalid interval");
        
        batchConfig.symbols = _symbols;
        batchConfig.maxGasPerUpdate = _maxGasPerUpdate;
        batchConfig.updateInterval = _updateInterval;
        batchConfig.autoUpdate = _autoUpdate;
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
}