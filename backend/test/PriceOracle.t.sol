// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/PriceOracle.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title PriceOracleTest
 * @dev PriceOracle 合約的測試套件
 */
contract PriceOracleTest is Test {
    PriceOracle public oracle;
    PriceOracle public implementation;
    
    address public owner;
    address public updater1;
    address public updater2;
    address public user1;
    address public mockFeedAddress1;
    address public mockFeedAddress2;
    
    string constant SYMBOL_ETH = "ETH";
    string constant SYMBOL_BTC = "BTC";
    string constant SYMBOL_USDC = "USDC";
    
    uint256 constant HEARTBEAT_1H = 3600;
    uint256 constant HEARTBEAT_5M = 300;
    uint256 constant DEVIATION_100BP = 100; // 1%
    uint256 constant DEVIATION_500BP = 500; // 5%
    
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
    
    event UpdaterAuthorized(address indexed updater, bool authorized);
    
    function setUp() public {
        // 設置測試地址
        owner = makeAddr("owner");
        updater1 = makeAddr("updater1");
        updater2 = makeAddr("updater2");
        user1 = makeAddr("user1");
        mockFeedAddress1 = makeAddr("mockFeed1");
        mockFeedAddress2 = makeAddr("mockFeed2");
        
        // 部署實現合約
        implementation = new PriceOracle();
        
        // 部署代理合約
        bytes memory initData = abi.encodeWithSelector(
            PriceOracle.initialize.selector,
            owner
        );
        
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );
        
        oracle = PriceOracle(address(proxy));
    }
    
    // ============ 合約初始化測試 ============
    
    function testInitialization() public {
        assertEq(oracle.owner(), owner, "Owner should be set correctly");
        assertFalse(oracle.paused(), "Contract should not be paused initially");
        
        // 檢查批量更新配置
        (uint256 maxGas, uint256 interval, bool autoUpdate) = oracle.batchConfig();
        assertEq(maxGas, 500000, "Max gas should be 500000");
        assertEq(interval, 300, "Update interval should be 300 seconds");
        assertTrue(autoUpdate, "Auto update should be enabled");
        
        assertEq(oracle.PRICE_DECIMALS(), 18, "Price decimals should be 18");
        assertEq(oracle.MAX_PRICE_AGE(), 3600, "Max price age should be 3600 seconds");
    }
    
    function testInitializationWithZeroOwner() public {
        PriceOracle newImplementation = new PriceOracle();
        
        bytes memory initData = abi.encodeWithSelector(
            PriceOracle.initialize.selector,
            address(0)
        );
        
        // 初始化函數不會revert零地址，但會設置零地址為owner
        ERC1967Proxy proxy = new ERC1967Proxy(address(newImplementation), initData);
        PriceOracle newOracle = PriceOracle(address(proxy));
        
        assertEq(newOracle.owner(), address(0), "Owner should be zero address");
    }
    
    // ============ 價格源管理測試 ============
    
    function testAddPriceFeed() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit PriceFeedAdded(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H);
        
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        
        (address feedAddress, uint32 heartbeat, uint16 deviation, bool isActive) = oracle.priceFeeds(SYMBOL_ETH);
        assertEq(feedAddress, mockFeedAddress1, "Feed address should match");
        assertEq(heartbeat, HEARTBEAT_1H, "Heartbeat should match");
        assertEq(deviation, DEVIATION_100BP, "Deviation should match");
        assertTrue(isActive, "Feed should be active");
    }
    
    function testAddPriceFeedWithInvalidAddress() public {
        vm.prank(owner);
        vm.expectRevert("PriceOracle: Invalid feed address");
        oracle.addPriceFeed(SYMBOL_ETH, address(0), HEARTBEAT_1H, DEVIATION_100BP);
    }
    
    function testAddPriceFeedWithInvalidHeartbeat() public {
        vm.prank(owner);
        vm.expectRevert("PriceOracle: Invalid heartbeat");
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, 0, DEVIATION_100BP);
    }
    
    function testAddPriceFeedWithInvalidDeviation() public {
        vm.prank(owner);
        vm.expectRevert("PriceOracle: Invalid deviation");
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, 10001);
    }
    
    function testAddPriceFeedUnauthorized() public {
        vm.prank(user1);
        vm.expectRevert();
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
    }
    
    function testUpdatePriceFeed() public {
        // 首先添加價格源
        vm.prank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        
        // 更新價格源
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit PriceFeedUpdated(SYMBOL_ETH, mockFeedAddress1, mockFeedAddress2);
        
        oracle.updatePriceFeed(SYMBOL_ETH, mockFeedAddress2);
        
        (address feedAddress,,,) = oracle.priceFeeds(SYMBOL_ETH);
        assertEq(feedAddress, mockFeedAddress2, "Feed address should be updated");
    }
    
    function testUpdatePriceFeedWithInvalidSymbol() public {
        vm.prank(owner);
        vm.expectRevert("PriceOracle: Feed not active");
        oracle.updatePriceFeed(SYMBOL_ETH, mockFeedAddress2);
    }
    
    function testUpdatePriceFeedWithInvalidAddress() public {
        // 首先添加價格源
        vm.prank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        
        vm.prank(owner);
        vm.expectRevert("PriceOracle: Invalid feed address");
        oracle.updatePriceFeed(SYMBOL_ETH, address(0));
    }
    
    function testSetPriceFeedActive() public {
        // 首先添加價格源
        vm.prank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        
        // 禁用價格源
        vm.prank(owner);
        oracle.setPriceFeedActive(SYMBOL_ETH, false);
        
        (,,,bool isActive) = oracle.priceFeeds(SYMBOL_ETH);
        assertFalse(isActive, "Feed should be inactive");
        
        // 重新啟用
        vm.prank(owner);
        oracle.setPriceFeedActive(SYMBOL_ETH, true);
        
        (,,,isActive) = oracle.priceFeeds(SYMBOL_ETH);
        assertTrue(isActive, "Feed should be active again");
    }
    
    function testSetPriceFeedActiveWithNonexistentFeed() public {
        vm.prank(owner);
        vm.expectRevert("PriceOracle: Feed not exists");
        oracle.setPriceFeedActive(SYMBOL_ETH, false);
    }
    
    function testSetAuthorizedUpdater() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit UpdaterAuthorized(updater1, true);
        
        oracle.setAuthorizedUpdater(updater1, true);
        
        assertTrue(oracle.authorizedUpdaters(updater1), "Updater should be authorized");
        
        // 取消授權
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit UpdaterAuthorized(updater1, false);
        
        oracle.setAuthorizedUpdater(updater1, false);
        
        assertFalse(oracle.authorizedUpdaters(updater1), "Updater should not be authorized");
    }
    
    function testSetAuthorizedUpdaterWithInvalidAddress() public {
        vm.prank(owner);
        vm.expectRevert("PriceOracle: Invalid updater");
        oracle.setAuthorizedUpdater(address(0), true);
    }
    
    // ============ 價格更新機制測試 ============
    
    function testUpdatePrice() public {
        // 設置價格源和授權更新者
        vm.prank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        
        vm.prank(owner);
        oracle.setAuthorizedUpdater(updater1, true);
        
        // 更新價格
        vm.prank(updater1);
        vm.expectEmit(true, false, false, false);
        emit PriceUpdated(SYMBOL_ETH, 0, 0, 0); // 具體值由模擬函數決定
        
        oracle.updatePrice(SYMBOL_ETH);
        
        // 檢查價格數據
        (uint128 price, uint64 timestamp, uint32 roundId, bool isValid) = oracle.priceData(SYMBOL_ETH);
        assertTrue(price > 0, "Price should be greater than 0");
        assertEq(timestamp, block.timestamp, "Timestamp should match block timestamp");
        assertTrue(isValid, "Price data should be valid");
    }
    
    function testUpdatePriceUnauthorized() public {
        // 設置價格源
        vm.prank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        
        // 未授權用戶嘗試更新價格
        vm.prank(user1);
        vm.expectRevert("PriceOracle: Not authorized updater");
        oracle.updatePrice(SYMBOL_ETH);
    }
    
    function testUpdatePriceWithInvalidSymbol() public {
        vm.prank(owner);
        oracle.setAuthorizedUpdater(updater1, true);
        
        vm.prank(updater1);
        vm.expectRevert("PriceOracle: Feed not active");
        oracle.updatePrice(SYMBOL_ETH);
    }
    
    function testUpdatePriceWhenPaused() public {
        // 設置價格源和授權更新者
        vm.prank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        
        vm.prank(owner);
        oracle.setAuthorizedUpdater(updater1, true);
        
        // 暫停合約
        vm.prank(owner);
        oracle.pause();
        
        // 嘗試更新價格
        vm.prank(updater1);
        vm.expectRevert();
        oracle.updatePrice(SYMBOL_ETH);
    }
    
    function testOwnerCanUpdatePrice() public {
        // 設置價格源
        vm.prank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        
        // 所有者直接更新價格
        vm.prank(owner);
        oracle.updatePrice(SYMBOL_ETH);
        
        (,,,bool isValid) = oracle.priceData(SYMBOL_ETH);
        assertTrue(isValid, "Price should be updated by owner");
    }
    
    function testBatchUpdatePrices() public {
        // 設置多個價格源
        vm.startPrank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        oracle.addPriceFeed(SYMBOL_BTC, mockFeedAddress2, HEARTBEAT_1H, DEVIATION_100BP);
        oracle.setAuthorizedUpdater(updater1, true);
        vm.stopPrank();
        
        // 先單獨更新價格以確保它們有效
        vm.startPrank(updater1);
        oracle.updatePrice(SYMBOL_ETH);
        oracle.updatePrice(SYMBOL_BTC);
        vm.stopPrank();
        
        string[] memory symbols = new string[](2);
        symbols[0] = SYMBOL_ETH;
        symbols[1] = SYMBOL_BTC;
        
        vm.prank(updater1);
        oracle.batchUpdatePrices(symbols);
        
        // 檢查批量更新記錄
        assertGt(oracle.lastBatchUpdate(), 0, "Last batch update should be set");
    }
    
    function testBatchUpdatePricesWithEmptyArray() public {
        vm.prank(owner);
        oracle.setAuthorizedUpdater(updater1, true);
        
        string[] memory symbols = new string[](0);
        
        vm.prank(updater1);
        vm.expectRevert("PriceOracle: Empty symbols array");
        oracle.batchUpdatePrices(symbols);
    }
    
    function testBatchUpdatePricesWithInactiveFeeds() public {
        // 設置價格源但禁用
        vm.startPrank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        oracle.setPriceFeedActive(SYMBOL_ETH, false);
        oracle.setAuthorizedUpdater(updater1, true);
        vm.stopPrank();
        
        string[] memory symbols = new string[](1);
        symbols[0] = SYMBOL_ETH;
        
        vm.prank(updater1);
        oracle.batchUpdatePrices(symbols);
        
        // 價格不應該被更新
        (,,,bool isValid) = oracle.priceData(SYMBOL_ETH);
        assertFalse(isValid, "Price should not be updated for inactive feed");
    }
    
    // ============ 價格查詢功能測試 ============
    
    function testGetPrice() public {
        // 設置並更新價格
        vm.startPrank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        oracle.setAuthorizedUpdater(updater1, true);
        vm.stopPrank();
        
        vm.prank(updater1);
        oracle.updatePrice(SYMBOL_ETH);
        
        // 獲取價格
        (uint256 price, uint256 timestamp) = oracle.getPrice(SYMBOL_ETH);
        
        assertGt(price, 0, "Price should be greater than 0");
        assertEq(timestamp, block.timestamp, "Timestamp should match");
    }
    
    function testGetPriceWithInvalidSymbol() public {
        vm.expectRevert("PriceOracle: Price not available");
        oracle.getPrice(SYMBOL_ETH);
    }
    
    function testGetPriceWithOldPrice() public {
        // 設置並更新價格
        vm.startPrank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        oracle.setAuthorizedUpdater(updater1, true);
        vm.stopPrank();
        
        vm.prank(updater1);
        oracle.updatePrice(SYMBOL_ETH);
        
        // 時間前進超過最大年齡
        vm.warp(block.timestamp + oracle.MAX_PRICE_AGE() + 1);
        
        vm.expectRevert("PriceOracle: Price too old");
        oracle.getPrice(SYMBOL_ETH);
    }
    
    function testGetLatestPrice() public {
        // 設置並更新價格
        vm.startPrank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        oracle.setAuthorizedUpdater(updater1, true);
        vm.stopPrank();
        
        vm.prank(updater1);
        oracle.updatePrice(SYMBOL_ETH);
        
        // 時間前進超過最大年齡
        vm.warp(block.timestamp + oracle.MAX_PRICE_AGE() + 1);
        
        // 應該仍然能獲取價格
        (uint256 price, uint256 timestamp, bool isValid) = oracle.getLatestPrice(SYMBOL_ETH);
        
        assertGt(price, 0, "Price should be greater than 0");
        assertLt(timestamp, block.timestamp, "Timestamp should be in the past");
        assertTrue(isValid, "Price should be valid");
    }
    
    function testGetLatestPriceWithInvalidSymbol() public {
        (uint256 price, uint256 timestamp, bool isValid) = oracle.getLatestPrice(SYMBOL_ETH);
        
        assertEq(price, 0, "Price should be 0");
        assertEq(timestamp, 0, "Timestamp should be 0");
        assertFalse(isValid, "Price should not be valid");
    }
    
    function testGetBatchPrices() public {
        // 設置多個價格源並更新
        vm.startPrank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_1H, DEVIATION_100BP);
        oracle.addPriceFeed(SYMBOL_BTC, mockFeedAddress2, HEARTBEAT_1H, DEVIATION_100BP);
        oracle.setAuthorizedUpdater(updater1, true);
        vm.stopPrank();
        
        vm.startPrank(updater1);
        oracle.updatePrice(SYMBOL_ETH);
        oracle.updatePrice(SYMBOL_BTC);
        vm.stopPrank();
        
        string[] memory symbols = new string[](2);
        symbols[0] = SYMBOL_ETH;
        symbols[1] = SYMBOL_BTC;
        
        (uint256[] memory prices, uint256[] memory timestamps) = oracle.getBatchPrices(symbols);
        
        assertEq(prices.length, 2, "Should return 2 prices");
        assertEq(timestamps.length, 2, "Should return 2 timestamps");
        assertGt(prices[0], 0, "ETH price should be greater than 0");
        assertGt(prices[1], 0, "BTC price should be greater than 0");
    }
    
    function testNeedsPriceUpdate() public {
        // 設置價格源
        vm.prank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_5M, DEVIATION_100BP);
        
        // 新添加的價格源需要更新
        assertTrue(oracle.needsPriceUpdate(SYMBOL_ETH), "New feed should need update");
        
        // 更新價格
        vm.prank(owner);
        oracle.updatePrice(SYMBOL_ETH);
        
        // 剛更新的價格不需要更新
        assertFalse(oracle.needsPriceUpdate(SYMBOL_ETH), "Recently updated price should not need update");
        
        // 時間前進超過心跳間隔
        vm.warp(block.timestamp + HEARTBEAT_5M + 1);
        
        // 現在需要更新
        assertTrue(oracle.needsPriceUpdate(SYMBOL_ETH), "Old price should need update");
    }
    
    function testNeedsPriceUpdateWithInactiveFeeds() public {
        // 設置價格源但禁用
        vm.startPrank(owner);
        oracle.addPriceFeed(SYMBOL_ETH, mockFeedAddress1, HEARTBEAT_5M, DEVIATION_100BP);
        oracle.setPriceFeedActive(SYMBOL_ETH, false);
        vm.stopPrank();
        
        // 禁用的價格源不需要更新
        assertFalse(oracle.needsPriceUpdate(SYMBOL_ETH), "Inactive feed should not need update");
    }
    
    // ============ 輔助測試函數 ============
    
    function testPauseAndUnpause() public {
        vm.prank(owner);
        oracle.pause();
        assertTrue(oracle.paused(), "Contract should be paused");
        
        vm.prank(owner);
        oracle.unpause();
        assertFalse(oracle.paused(), "Contract should be unpaused");
    }
    
    function testGetVersion() public {
        string memory version = oracle.getVersion();
        assertEq(version, "1.0.0", "Version should be 1.0.0");
    }
}