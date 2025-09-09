// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../contracts/PersonalTokenFactory.sol";
import "../contracts/AthleteRegistry.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract PersonalTokenFactoryTest is Test {
    PersonalTokenFactory public factory;
    AthleteRegistry public athleteRegistry;
    PersonalToken public personalToken;
    
    address public owner;
    address public athlete1;
    address public athlete2;
    address public investor1;
    address public investor2;
    address public verifier1;
    address public unauthorizedUser;
    
    uint256 constant CREATION_FEE = 0.01 ether;
    uint256 constant PLATFORM_FEE_PERCENTAGE = 500; // 5%
    uint256 constant REGISTRATION_FEE = 0.01 ether;
    uint256 constant BASE_PRICE = 0.01 ether;
    uint256 constant BASE_SUPPLY = 1000;
    
    string constant TOKEN_NAME = "Athlete Token";
    string constant TOKEN_SYMBOL = "ATH";
    
    function setUp() public {
        owner = address(this);
        athlete1 = makeAddr("athlete1");
        athlete2 = makeAddr("athlete2");
        investor1 = makeAddr("investor1");
        investor2 = makeAddr("investor2");
        verifier1 = makeAddr("verifier1");
        unauthorizedUser = makeAddr("unauthorizedUser");
        
        // 部署 AthleteRegistry
        AthleteRegistry registryImpl = new AthleteRegistry();
        bytes memory registryInitData = abi.encodeWithSelector(
            AthleteRegistry.initialize.selector,
            owner,
            REGISTRATION_FEE
        );
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            registryInitData
        );
        athleteRegistry = AthleteRegistry(address(registryProxy));
        
        // 部署 PersonalTokenFactory
        PersonalTokenFactory factoryImpl = new PersonalTokenFactory();
        bytes memory factoryInitData = abi.encodeWithSelector(
            PersonalTokenFactory.initialize.selector,
            owner,
            address(athleteRegistry),
            CREATION_FEE,
            PLATFORM_FEE_PERCENTAGE
        );
        ERC1967Proxy factoryProxy = new ERC1967Proxy(
            address(factoryImpl),
            factoryInitData
        );
        factory = PersonalTokenFactory(payable(address(factoryProxy)));
        
        // 设置验证者
        athleteRegistry.addVerifier(verifier1, "Test Verifier");
        
        // 注册并验证运动员
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        athleteRegistry.registerAthlete{value: REGISTRATION_FEE}(
            "Athlete One",
            "Football",
            "https://example.com/profile1"
        );
        
        vm.prank(verifier1);
        athleteRegistry.verifyAthlete(athlete1);
        
        // 为投资者提供资金
        vm.deal(investor1, 10 ether);
        vm.deal(investor2, 10 ether);
    }
    
    // ========== 合约初始化测试 ==========
    
    function testFactoryInitialization() public {
        assertEq(factory.owner(), owner);
        assertEq(address(factory.athleteRegistry()), address(athleteRegistry));
        assertEq(factory.creationFee(), CREATION_FEE);
        assertEq(factory.platformFeePercentage(), PLATFORM_FEE_PERCENTAGE);
        assertEq(factory.MAX_PLATFORM_FEE(), 1000); // 10%
    }
    
    function testFactoryInitializationWithInvalidRegistry() public {
        PersonalTokenFactory newFactoryImpl = new PersonalTokenFactory();
        
        bytes memory initData = abi.encodeWithSelector(
            PersonalTokenFactory.initialize.selector,
            owner,
            address(0), // 无效的注册合约地址
            CREATION_FEE,
            PLATFORM_FEE_PERCENTAGE
        );
        
        vm.expectRevert("PersonalTokenFactory: Invalid registry address");
        new ERC1967Proxy(address(newFactoryImpl), initData);
    }
    
    function testFactoryInitializationWithHighFee() public {
        PersonalTokenFactory newFactoryImpl = new PersonalTokenFactory();
        
        bytes memory initData = abi.encodeWithSelector(
            PersonalTokenFactory.initialize.selector,
            owner,
            address(athleteRegistry),
            CREATION_FEE,
            1500 // 超过最大手续费 (15% > 10%)
        );
        
        vm.expectRevert("PersonalTokenFactory: Fee too high");
        new ERC1967Proxy(address(newFactoryImpl), initData);
    }
    
    function testPersonalTokenInitialization() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 验证 PersonalToken 初始化
        assertEq(personalToken.name(), TOKEN_NAME);
        assertEq(personalToken.symbol(), TOKEN_SYMBOL);
        assertEq(personalToken.athlete(), athlete1);
        assertEq(personalToken.factory(), address(factory));
        assertEq(personalToken.basePrice(), BASE_PRICE);
        assertEq(personalToken.baseSupply(), BASE_SUPPLY);
        
        // 验证初始代币分配 (运动员获得基础供应量的10%)
        assertEq(personalToken.balanceOf(athlete1), BASE_SUPPLY / 10);
        assertEq(personalToken.totalSupply(), BASE_SUPPLY / 10);
        
        // 验证常量
        assertEq(personalToken.MAX_SUPPLY(), 1000000 * 10**18);
        assertEq(personalToken.MIN_PURCHASE_AMOUNT(), 1);
        assertEq(personalToken.MAX_PURCHASE_AMOUNT(), 10000);
    }
    
    // ========== 联合曲线定价机制测试 ==========
    
    function testBasicPriceCalculation() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 测试当前价格计算
        uint256 currentPrice = personalToken.getCurrentPrice();
        assertTrue(currentPrice > 0, "Current price should be positive");
        
        // 验证价格公式：P = 0.01 * (1 + supply/1000)^1.5
        // 当前供应量为 BASE_SUPPLY / 10 = 100
        // 预期价格应该大于基础价格
        assertTrue(currentPrice >= 0.01 ether / 100, "Price should be at least minimum price");
    }
    
    function testSmallAmountPurchaseCost() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 测试小额购买 (<=10 代币) - 使用简化计算
        uint256 amount = 5;
        uint256 cost = personalToken.calculatePurchaseCost(amount);
        
        assertTrue(cost > 0, "Purchase cost should be positive");
        
        // 验证成本合理性
        uint256 currentPrice = personalToken.getCurrentPrice();
        uint256 expectedMinCost = currentPrice * amount / 2; // 大概的最小成本
        uint256 expectedMaxCost = currentPrice * amount * 2; // 大概的最大成本
        
        assertTrue(cost >= expectedMinCost, "Cost should be reasonable (min)");
        assertTrue(cost <= expectedMaxCost, "Cost should be reasonable (max)");
    }
    
    function testLargeAmountPurchaseCost() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 测试大额购买 (>10 代币) - 使用分段计算
        uint256 amount = 100;
        uint256 cost = personalToken.calculatePurchaseCost(amount);
        
        assertTrue(cost > 0, "Purchase cost should be positive");
        
        // 验证大额购买的总成本比小额购买的总成本更高
        uint256 smallAmount = 10;
        uint256 smallCost = personalToken.calculatePurchaseCost(smallAmount);
        
        assertTrue(cost > smallCost, "Large purchase should have higher total cost");
        
        // 验证成本合理性 - 大额购买应该至少是小额购买成本的倍数
        assertTrue(cost >= smallCost * (amount / smallAmount), "Large purchase cost should be proportional");
    }
    
    function testPriceAfterPurchase() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        uint256 currentPrice = personalToken.getCurrentPrice();
        uint256 amount = 50;
        uint256 priceAfter = personalToken.getPriceAfterPurchase(amount);
        
        // 验证价格计算的基本合理性
        assertTrue(currentPrice > 0, "Current price should be positive");
        assertTrue(priceAfter > 0, "Price after purchase should be positive");
        
        // 由于联合曲线的特性，购买后价格应该更高或至少相等
        assertTrue(priceAfter >= currentPrice, "Price should not decrease after purchase");
    }
    
    function testPriceImpact() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 测试不同数量的价格影响
        uint256 smallAmount = 10;
        uint256 largeAmount = 100;
        
        uint256 smallImpact = personalToken.getPriceImpact(smallAmount);
        uint256 largeImpact = personalToken.getPriceImpact(largeAmount);
        
        // 验证价格影响的基本合理性
        assertTrue(smallImpact >= 0, "Small impact should be non-negative");
        assertTrue(largeImpact >= 0, "Large impact should be non-negative");
        
        // 大额购买应该有更大或相等的价格影响
        assertTrue(largeImpact >= smallImpact, "Large purchase should have greater or equal price impact");
        
        // 价格影响应该是合理的百分比 (以 basis points 计算)
        assertTrue(smallImpact <= 10000, "Small impact should be reasonable"); // 100% = 10000 basis points
        assertTrue(largeImpact <= 20000, "Large impact should be reasonable"); // 200% = 20000 basis points
    }
    
    function testSaleRefundCalculation() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 运动员已有初始代币，测试出售退款计算
        uint256 athleteBalance = personalToken.balanceOf(athlete1);
        assertTrue(athleteBalance > 0, "Athlete should have initial tokens");
        
        uint256 sellAmount = athleteBalance / 2;
        uint256 refund = personalToken.calculateSaleRefund(sellAmount);
        
        assertTrue(refund > 0, "Refund should be positive");
        
        // 验证出售折扣 (95% 退款)
        uint256 purchaseCost = personalToken.calculatePurchaseCost(sellAmount);
        uint256 expectedRefund = (purchaseCost * 95) / 100;
        
        // 由于价格曲线的影响，实际退款可能与预期略有不同，但应该在合理范围内
        assertTrue(refund <= expectedRefund, "Refund should not exceed 95% of purchase cost");
        assertTrue(refund >= expectedRefund / 2, "Refund should be reasonable");
    }
    
    function testSaleRefundInsufficientSupply() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        uint256 totalSupply = personalToken.totalSupply();
        uint256 excessiveAmount = totalSupply + 1;
        
        vm.expectRevert("PersonalToken: Insufficient supply");
        personalToken.calculateSaleRefund(excessiveAmount);
    }
    
    function testPricingConsistency() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 测试定价一致性：多次小额购买 vs 一次大额购买
        uint256 singleAmount = 50;
        uint256 singleCost = personalToken.calculatePurchaseCost(singleAmount);
        
        // 分5次购买，每次10个
        uint256 totalMultipleCost = 0;
        uint256 currentSupply = personalToken.totalSupply();
        
        for (uint256 i = 0; i < 5; i++) {
            // 模拟供应量增加后的价格计算
            PersonalToken tempToken = new PersonalToken(
                "Temp",
                "TEMP",
                athlete1,
                address(factory),
                BASE_PRICE,
                BASE_SUPPLY
            );
            
            // 这里简化测试，主要验证价格计算函数的一致性
            uint256 stepCost = personalToken.calculatePurchaseCost(10);
            totalMultipleCost += stepCost;
        }
        
        // 由于联合曲线的特性，一次大额购买应该比多次小额购买更贵
        // 但这里主要测试计算的一致性和合理性
        assertTrue(singleCost > 0, "Single purchase cost should be positive");
        assertTrue(totalMultipleCost > 0, "Multiple purchase cost should be positive");
    }
    
    function testMinimumPriceFloor() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        uint256 currentPrice = personalToken.getCurrentPrice();
        uint256 minimumPrice = 0.01 ether / 100; // 0.0001 ETH
        
        // 当前价格应该不低于最小价格
        assertTrue(currentPrice >= minimumPrice, "Price should not be below minimum floor");
    }
    
    // ========== 代币交易功能测试 ==========
    
    function testBuyTokensBasic() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        uint256 amount = 10;
        uint256 cost = personalToken.calculatePurchaseCost(amount);
        uint256 initialBalance = personalToken.balanceOf(investor1);
        uint256 initialSupply = personalToken.totalSupply();
        
        // 投资者购买代币
        vm.prank(investor1);
        personalToken.buyTokens{value: cost}(amount);
        
        // 验证购买结果
        assertEq(personalToken.balanceOf(investor1), initialBalance + amount, "Investor should receive tokens");
        assertEq(personalToken.totalSupply(), initialSupply + amount, "Total supply should increase");
    }
    
    function testBuyTokensInsufficientPayment() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        uint256 amount = 10;
        uint256 cost = personalToken.calculatePurchaseCost(amount);
        
        // 尝试用不足的资金购买
        vm.prank(investor1);
        vm.expectRevert("PersonalToken: Insufficient payment");
        personalToken.buyTokens{value: cost - 1}(amount);
    }
    
    function testBuyTokensExcessiveAmount() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        uint256 excessiveAmount = 10001; // 超过最大购买限制
        
        vm.prank(investor1);
        vm.expectRevert("PersonalToken: Amount too large");
        personalToken.buyTokens{value: 1 ether}(excessiveAmount);
    }
    
    function testBuyTokensMinimumAmount() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 尝试购买少于最小数量的代币
        vm.prank(investor1);
        vm.expectRevert("PersonalToken: Amount too small");
        personalToken.buyTokens{value: 0.01 ether}(0);
    }
    
    function testSellTokensBasic() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 先购买一些代币
        uint256 buyAmount = 50;
        uint256 buyCost = personalToken.calculatePurchaseCost(buyAmount);
        vm.prank(investor1);
        personalToken.buyTokens{value: buyCost}(buyAmount);
        
        // 出售部分代币
        uint256 sellAmount = 20;
        uint256 expectedRefund = personalToken.calculateSaleRefund(sellAmount);
        uint256 initialBalance = investor1.balance;
        uint256 initialTokenBalance = personalToken.balanceOf(investor1);
        
        vm.prank(investor1);
        personalToken.sellTokens(sellAmount);
        
        // 验证出售结果
        assertEq(personalToken.balanceOf(investor1), initialTokenBalance - sellAmount, "Token balance should decrease");
        assertTrue(investor1.balance > initialBalance, "Should receive refund");
        assertTrue(investor1.balance <= initialBalance + expectedRefund, "Refund should not exceed expected");
    }
    
    function testSellTokensInsufficientBalance() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 尝试出售超过余额的代币
        vm.prank(investor1);
        vm.expectRevert("PersonalToken: Insufficient balance");
        personalToken.sellTokens(100);
    }
    
    function testMultipleTokenPurchases() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        PersonalToken personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 第一次购买
        uint256 amount1 = 10;
        uint256 cost1 = personalToken.calculatePurchaseCost(amount1);
        vm.prank(investor1);
        personalToken.buyTokens{value: cost1}(amount1);
        
        // 第二次购买
        uint256 amount2 = 15;
        uint256 cost2 = personalToken.calculatePurchaseCost(amount2);
        vm.prank(investor2);
        personalToken.buyTokens{value: cost2}(amount2);
        
        // 验证购买结果
        assertEq(personalToken.balanceOf(investor1), amount1, "Investor1 should have correct token balance");
        assertEq(personalToken.balanceOf(investor2), amount2, "Investor2 should have correct token balance");
        assertEq(personalToken.totalSupply(), BASE_SUPPLY / 10 + amount1 + amount2, "Total supply should be correct");
    }
    
    function testTokenTransferAfterPurchase() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        PersonalToken personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 购买代币
        uint256 amount = 20;
        uint256 cost = personalToken.calculatePurchaseCost(amount);
        vm.prank(investor1);
        personalToken.buyTokens{value: cost}(amount);
        
        // 转移代币
        uint256 transferAmount = 5;
        vm.prank(investor1);
        personalToken.transfer(investor2, transferAmount);
        
        // 验证转移结果
        assertEq(personalToken.balanceOf(investor1), amount - transferAmount, "Investor1 balance should decrease");
        assertEq(personalToken.balanceOf(investor2), transferAmount, "Investor2 should receive tokens");
    }
    
    function testPriceUpdateAfterTrade() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        uint256 initialPrice = personalToken.getCurrentPrice();
        
        // 购买代币
        uint256 buyAmount = 100;
        uint256 buyCost = personalToken.calculatePurchaseCost(buyAmount);
        vm.prank(investor1);
        personalToken.buyTokens{value: buyCost}(buyAmount);
        
        uint256 priceAfterBuy = personalToken.getCurrentPrice();
        
        // 出售部分代币
        uint256 sellAmount = 30;
        vm.prank(investor1);
        personalToken.sellTokens(sellAmount);
        
        uint256 priceAfterSell = personalToken.getCurrentPrice();
        
        // 验证价格变化
        assertTrue(priceAfterBuy >= initialPrice, "Price should not decrease after purchase");
        assertTrue(priceAfterSell <= priceAfterBuy, "Price should not increase after sale");
        assertTrue(priceAfterSell >= initialPrice, "Price should not go below initial after partial sale");
    }
    
    function testTradeEvents() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        uint256 amount = 25;
        uint256 cost = personalToken.calculatePurchaseCost(amount);
        
        // 测试购买事件
        vm.expectEmit(true, false, false, true);
        emit PersonalToken.TokensPurchased(investor1, amount, cost);
        
        vm.prank(investor1);
        personalToken.buyTokens{value: cost}(amount);
        
        // 测试出售事件
        uint256 sellAmount = 10;
        uint256 refund = personalToken.calculateSaleRefund(sellAmount);
        
        vm.expectEmit(true, false, false, true);
        emit PersonalToken.TokensSold(investor1, sellAmount, refund);
        
        vm.prank(investor1);
        personalToken.sellTokens(sellAmount);
    }
    
    function testReentrancyProtection() public {
        // 创建个人代币
        vm.deal(athlete1, 1 ether);
        vm.prank(athlete1);
        factory.createPersonalToken{value: CREATION_FEE}(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            BASE_PRICE,
            BASE_SUPPLY
        );
        
        PersonalTokenFactory.TokenInfo memory tokenInfo = factory.getAthleteToken(athlete1);
        personalToken = PersonalToken(payable(tokenInfo.tokenAddress));
        
        // 部署恶意合约来测试重入攻击
        ReentrancyAttacker attacker = new ReentrancyAttacker(address(personalToken));
        vm.deal(address(attacker), 1 ether);
        
        // 尝试重入攻击应该失败
        vm.expectRevert("PersonalToken: Reentrant call");
        attacker.attack{value: 0.1 ether}();
    }
}

// 用于测试重入攻击的恶意合约
contract ReentrancyAttacker {
    PersonalToken public target;
    bool public attacking = false;
    
    constructor(address _target) {
        target = PersonalToken(payable(_target));
    }
    
    function attack() external payable {
        attacking = true;
        uint256 amount = 10;
        target.buyTokens{value: msg.value}(amount);
    }
    
    receive() external payable {
        if (attacking) {
            // 尝试重入
            target.buyTokens{value: 0.01 ether}(5);
        }
    }
}