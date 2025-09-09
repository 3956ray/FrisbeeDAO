// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./AthleteRegistry.sol";

/**
 * @title PersonalToken
 * @dev 运动员个人代币合约
 */
contract PersonalToken is ERC20, Ownable {
    using Address for address payable;
    using SafeERC20 for IERC20;
    
    address public athlete;
    address public factory;
    uint256 public basePrice;
    uint256 public baseSupply;
    
    // 安全性狀態變量
    bool private _locked;
    uint256 public constant MAX_SUPPLY = 1000000 * 10**18; // 最大供應量限制
    uint256 public constant MIN_PURCHASE_AMOUNT = 1; // 最小購買數量
    uint256 public constant MAX_PURCHASE_AMOUNT = 10000; // 最大購買數量限制
    
    // 重入攻擊防護修飾符
    modifier nonReentrant() {
        require(!_locked, "PersonalToken: Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }
    
    // 數量驗證修飾符
    modifier validAmount(uint256 _amount) {
        require(_amount >= MIN_PURCHASE_AMOUNT, "PersonalToken: Amount too small");
        require(_amount <= MAX_PURCHASE_AMOUNT, "PersonalToken: Amount too large");
        _;
    }
    
    // 供應量檢查修飾符
    modifier supplyCheck(uint256 _amount) {
        require(totalSupply() + _amount <= MAX_SUPPLY, "PersonalToken: Exceeds max supply");
        _;
    }
    
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event TokensSold(address indexed seller, uint256 amount, uint256 refund);
    
    constructor(
        string memory _name,
        string memory _symbol,
        address _athlete,
        address _factory,
        uint256 _basePrice,
        uint256 _baseSupply
    ) ERC20(_name, _symbol) Ownable(_factory) {
        athlete = _athlete;
        factory = _factory;
        basePrice = _basePrice;
        baseSupply = _baseSupply;
        
        // 给运动员铸造初始供应量的10%
        _mint(_athlete, _baseSupply / 10);
    }
    
    /**
     * @dev 计算购买代币的成本 - 新的联合曲线定价机制
     * @param _amount 购买数量
     * @return cost 总成本
     */
    function calculatePurchaseCost(uint256 _amount) public view returns (uint256 cost) {
        uint256 currentSupply = totalSupply();
        
        // 優化的联合曲线定价計算 - 減少循環次數提高Gas效率
        // 對於小額購買使用簡化計算，大額購買使用分段計算
        if (_amount <= 10) {
            // 小額購買：直接使用當前價格
            uint256 avgPrice = _calculatePrice(currentSupply + _amount / 2);
            cost = avgPrice * _amount;
        } else {
            // 大額購買：使用優化的分段計算，最多10段
            uint256 segments = _amount > 1000 ? 10 : (_amount > 100 ? 5 : 2);
            uint256 segmentSize = _amount / segments;
            uint256 remainder = _amount % segments;
            
            cost = 0;
            uint256 supply = currentSupply;
            
            // 計算每個段的成本
            for (uint256 i = 0; i < segments; i++) {
                uint256 currentSegmentSize = segmentSize;
                if (i == segments - 1) {
                    currentSegmentSize += remainder;
                }
                
                // 使用段中點的價格計算成本
                uint256 midSupply = supply + currentSegmentSize / 2;
                uint256 segmentPrice = _calculatePrice(midSupply);
                cost += segmentPrice * currentSegmentSize;
                
                supply += currentSegmentSize;
            }
        }
    }
    
    /**
     * @dev 计算特定供应量下的价格
     * @param _supply 供应量
     * @return price 价格 (wei)
     */
    function _calculatePrice(uint256 _supply) private pure returns (uint256 price) {
        // P = 0.01 * (1 + supply/1000)^1.5
        // 为了避免浮点运算，使用整数运算
        // 基础价格 = 0.01 ETH = 10^16 wei
        uint256 initialPrice = 10**16; // 0.01 ETH in wei
        
        // 计算 (1 + supply/1000)
        uint256 factor = 1000 + _supply; // 乘以1000避免小数
        
        // 计算 factor^1.5 = factor * sqrt(factor)
        // 使用近似算法计算平方根
        uint256 sqrtFactor = _sqrt(factor * 1000); // 乘以1000保持精度
        uint256 powerFactor = (factor * sqrtFactor) / 1000; // 除以1000恢复精度
        
        // 最终价格计算
        price = (initialPrice * powerFactor) / (1000 * 1000); // 除以1000^2因为之前乘了两次1000
        
        // 确保最小价格
        if (price < initialPrice / 100) {
            price = initialPrice / 100; // 最小价格为0.0001 ETH
        }
    }
    
    /**
     * @dev 计算平方根 (使用巴比伦方法)
     * @param x 输入值
     * @return y 平方根
     */
    function _sqrt(uint256 x) private pure returns (uint256 y) {
        if (x == 0) return 0;
        
        uint256 z = (x + 1) / 2;
        y = x;
        
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
    
    /**
     * @dev 计算出售代币的退款 - 新的联合曲线定价机制
     * @param _amount 出售数量
     * @return refund 退款金额
     */
    function calculateSaleRefund(uint256 _amount) public view returns (uint256 refund) {
        uint256 currentSupply = totalSupply();
        require(_amount <= currentSupply, "PersonalToken: Insufficient supply");
        
        // 優化的退款計算 - 與購買計算保持一致的優化策略
        if (_amount <= 10) {
            // 小額出售：直接使用當前價格
            uint256 avgPrice = _calculatePrice(currentSupply - _amount / 2);
            refund = avgPrice * _amount;
        } else {
            // 大額出售：使用優化的分段計算
            uint256 segments = _amount > 1000 ? 10 : (_amount > 100 ? 5 : 2);
            uint256 segmentSize = _amount / segments;
            uint256 remainder = _amount % segments;
            
            refund = 0;
            uint256 supply = currentSupply;
            
            // 從當前供應量向下計算每個段的退款
            for (uint256 i = 0; i < segments; i++) {
                uint256 currentSegmentSize = segmentSize;
                if (i == segments - 1) {
                    currentSegmentSize += remainder;
                }
                
                // 使用段中點的價格計算退款
                uint256 midSupply = supply - currentSegmentSize / 2;
                uint256 segmentPrice = _calculatePrice(midSupply);
                refund += segmentPrice * currentSegmentSize;
                
                supply -= currentSegmentSize;
            }
        }
        
        // 应用出售折扣 (95% 退款，5% 作为流动性费用)
        refund = (refund * 95) / 100;
    }
    
    /**
     * @dev 获取当前代币价格 - 新的联合曲线定价机制
     * @return price 当前价格
     */
    function getCurrentPrice() public view returns (uint256 price) {
        uint256 currentSupply = totalSupply();
        price = _calculatePrice(currentSupply);
    }
    
    /**
     * @dev 获取购买指定数量代币后的价格
     * @param _amount 购买数量
     * @return price 购买后的价格
     */
    function getPriceAfterPurchase(uint256 _amount) public view returns (uint256 price) {
        uint256 newSupply = totalSupply() + _amount;
        price = _calculatePrice(newSupply);
    }
    
    /**
     * @dev 获取价格影响百分比
     * @param _amount 购买数量
     * @return impactPercentage 价格影响百分比 (basis points)
     */
    function getPriceImpact(uint256 _amount) public view returns (uint256 impactPercentage) {
        uint256 currentPrice = getCurrentPrice();
        uint256 newPrice = getPriceAfterPurchase(_amount);
        
        if (currentPrice == 0) return 0;
        
        impactPercentage = ((newPrice - currentPrice) * 10000) / currentPrice;
    }
    
    /**
     * @dev 购买代币 - 添加安全性檢查
     * @param _amount 购买数量
     */
    function buyTokens(uint256 _amount) 
        external 
        payable 
        nonReentrant 
        validAmount(_amount) 
        supplyCheck(_amount) 
    {
        uint256 cost = calculatePurchaseCost(_amount);
        require(msg.value >= cost, "PersonalToken: Insufficient payment");
        
        // 檢查合約餘額是否足夠支付退款（防止合約被耗盡）
        uint256 refund = msg.value - cost;
        if (refund > 0) {
            require(address(this).balance >= refund, "PersonalToken: Insufficient contract balance for refund");
        }
        
        _mint(msg.sender, _amount);
        
        emit TokensPurchased(msg.sender, _amount, cost);
        
        // 安全地退还多余的ETH
        if (refund > 0) {
            payable(msg.sender).sendValue(refund);
        }
    }
    
    /**
     * @dev 出售代币 - 添加安全性檢查
     * @param _amount 出售数量
     */
    function sellTokens(uint256 _amount) 
        external 
        nonReentrant 
        validAmount(_amount) 
    {
        require(balanceOf(msg.sender) >= _amount, "PersonalToken: Insufficient balance");
        
        uint256 refund = calculateSaleRefund(_amount);
        require(address(this).balance >= refund, "PersonalToken: Insufficient contract balance");
        require(refund > 0, "PersonalToken: Invalid refund amount");
        
        // 先銷毀代幣，再轉賬（遵循 CEI 模式）
        _burn(msg.sender, _amount);
        
        // 安全地轉賬退款
        payable(msg.sender).sendValue(refund);
        
        emit TokensSold(msg.sender, _amount, refund);
    }
    
    /**
     * @dev 接收ETH
     */
    receive() external payable {}
}

/**
 * @title PersonalTokenFactory
 * @dev 个人代币工厂合约，为运动员创建和管理个人代币
 */
contract PersonalTokenFactory is 
    Initializable, 
    OwnableUpgradeable, 
    UUPSUpgradeable, 
    ReentrancyGuardUpgradeable,
    PausableUpgradeable 
{
    AthleteRegistry public athleteRegistry;
    
    struct TokenInfo {
        address tokenAddress;
        string name;
        string symbol;
        uint256 basePrice;
        uint256 baseSupply;
        uint256 creationTime;
        bool isActive;
    }
    
    mapping(address => TokenInfo) public athleteTokens;
    mapping(address => address) public tokenToAthlete;
    address[] public allTokens;
    
    uint256 public creationFee;
    uint256 public platformFeePercentage; // 平台手续费百分比 (basis points, 100 = 1%)
    uint256 public constant MAX_PLATFORM_FEE = 1000; // 最大10%
    
    // 事件定义
    event TokenCreated(
        address indexed athlete,
        address indexed tokenAddress,
        string name,
        string symbol,
        uint256 basePrice,
        uint256 baseSupply
    );
    
    event TokenDeactivated(
        address indexed athlete,
        address indexed tokenAddress
    );
    
    event PlatformFeeUpdated(
        uint256 oldFee,
        uint256 newFee
    );
    
    event CreationFeeUpdated(
        uint256 oldFee,
        uint256 newFee
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化合约
     * @param _owner 合约所有者
     * @param _athleteRegistry 运动员注册合约地址
     * @param _creationFee 创建费用
     * @param _platformFeePercentage 平台手续费百分比
     */
    function initialize(
        address _owner,
        address _athleteRegistry,
        uint256 _creationFee,
        uint256 _platformFeePercentage
    ) public initializer {
        require(_athleteRegistry != address(0), "PersonalTokenFactory: Invalid registry address");
        require(_platformFeePercentage <= MAX_PLATFORM_FEE, "PersonalTokenFactory: Fee too high");
        
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        athleteRegistry = AthleteRegistry(_athleteRegistry);
        creationFee = _creationFee;
        platformFeePercentage = _platformFeePercentage;
    }

    /**
     * @dev 为运动员创建个人代币
     * @param _name 代币名称
     * @param _symbol 代币符号
     * @param _basePrice 基础价格
     * @param _baseSupply 基础供应量
     */
    function createPersonalToken(
        string calldata _name,
        string calldata _symbol,
        uint256 _basePrice,
        uint256 _baseSupply
    ) external payable nonReentrant whenNotPaused {
        require(msg.value >= creationFee, "PersonalTokenFactory: Insufficient creation fee");
        require(_basePrice > 0, "PersonalTokenFactory: Base price must be positive");
        require(_baseSupply > 0, "PersonalTokenFactory: Base supply must be positive");
        require(bytes(_name).length > 0, "PersonalTokenFactory: Name cannot be empty");
        require(bytes(_symbol).length > 0, "PersonalTokenFactory: Symbol cannot be empty");
        
        // 检查运动员是否已注册且已验证
        require(
            athleteRegistry.isRegistered(msg.sender),
            "PersonalTokenFactory: Athlete not registered"
        );
        
        AthleteRegistry.AthleteProfile memory profile = athleteRegistry.getAthleteProfile(msg.sender);
        require(
            profile.status == AthleteRegistry.AthleteStatus.Verified,
            "PersonalTokenFactory: Athlete not verified"
        );
        
        // 检查是否已经创建过代币
        require(
            athleteTokens[msg.sender].tokenAddress == address(0),
            "PersonalTokenFactory: Token already exists"
        );
        
        // 创建新的个人代币合约
        PersonalToken newToken = new PersonalToken(
            _name,
            _symbol,
            msg.sender,
            address(this),
            _basePrice,
            _baseSupply
        );
        
        // 存储代币信息
        athleteTokens[msg.sender] = TokenInfo({
            tokenAddress: address(newToken),
            name: _name,
            symbol: _symbol,
            basePrice: _basePrice,
            baseSupply: _baseSupply,
            creationTime: block.timestamp,
            isActive: true
        });
        
        tokenToAthlete[address(newToken)] = msg.sender;
        allTokens.push(address(newToken));
        
        emit TokenCreated(
            msg.sender,
            address(newToken),
            _name,
            _symbol,
            _basePrice,
            _baseSupply
        );
        
        // 退还多余费用
        if (msg.value > creationFee) {
            payable(msg.sender).transfer(msg.value - creationFee);
        }
    }

    /**
     * @dev 停用代币
     * @param _athlete 运动员地址
     */
    function deactivateToken(address _athlete) external onlyOwner {
        require(
            athleteTokens[_athlete].tokenAddress != address(0),
            "PersonalTokenFactory: Token does not exist"
        );
        require(
            athleteTokens[_athlete].isActive,
            "PersonalTokenFactory: Token already deactivated"
        );
        
        athleteTokens[_athlete].isActive = false;
        
        emit TokenDeactivated(_athlete, athleteTokens[_athlete].tokenAddress);
    }

    /**
     * @dev 设置平台手续费
     * @param _newFeePercentage 新的手续费百分比
     */
    function setPlatformFeePercentage(uint256 _newFeePercentage) external onlyOwner {
        require(_newFeePercentage <= MAX_PLATFORM_FEE, "PersonalTokenFactory: Fee too high");
        
        uint256 oldFee = platformFeePercentage;
        platformFeePercentage = _newFeePercentage;
        
        emit PlatformFeeUpdated(oldFee, _newFeePercentage);
    }

    /**
     * @dev 设置创建费用
     * @param _newCreationFee 新的创建费用
     */
    function setCreationFee(uint256 _newCreationFee) external onlyOwner {
        uint256 oldFee = creationFee;
        creationFee = _newCreationFee;
        
        emit CreationFeeUpdated(oldFee, _newCreationFee);
    }

    /**
     * @dev 提取合约余额 - 添加安全性檢查
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "PersonalTokenFactory: No funds to withdraw");
        
        // 使用 Address.sendValue 進行安全轉賬
        Address.sendValue(payable(owner()), balance);
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
     * @dev 批量购买代币
     * @param _tokenAddress 代币地址
     * @param _amount 购买数量
     */
    function batchBuyTokens(
        address _tokenAddress,
        uint256 _amount
    ) external payable nonReentrant whenNotPaused {
        require(
            tokenToAthlete[_tokenAddress] != address(0),
            "PersonalTokenFactory: Invalid token"
        );
        
        address athlete = tokenToAthlete[_tokenAddress];
        require(
            athleteTokens[athlete].isActive,
            "PersonalTokenFactory: Token not active"
        );
        
        PersonalToken token = PersonalToken(payable(_tokenAddress));
        uint256 cost = token.calculatePurchaseCost(_amount);
        
        // 获取用户等级以计算折扣
        AthleteRegistry.UserLevel memory userLevel = athleteRegistry.getUserLevel(msg.sender, athlete);
        uint256 discount = 0;
        
        if (userLevel.currentLevel > 0) {
            AthleteRegistry.LevelConfig memory levelConfig = athleteRegistry.getLevelConfig(userLevel.currentLevel);
            discount = (cost * levelConfig.discountPercentage) / 10000;
        }
        
        uint256 discountedCost = cost - discount;
        
        // 计算平台手续费
        uint256 platformFee = (discountedCost * platformFeePercentage) / 10000;
        uint256 totalCost = discountedCost + platformFee;
        
        require(msg.value >= totalCost, "PersonalTokenFactory: Insufficient payment");
        
        // 檢查代幣合約餘額是否足夠
        require(address(token).balance >= discountedCost || discountedCost == 0, "PersonalTokenFactory: Token contract insufficient balance");
        
        // 記錄購買前的代幣餘額
        uint256 balanceBefore = IERC20(_tokenAddress).balanceOf(msg.sender);
        
        // 直接調用代幣合約的購買函數（代幣會直接鑄造給調用者）
        token.buyTokens{value: discountedCost}(_amount);
        
        // 驗證代幣是否正確鑄造
        uint256 balanceAfter = IERC20(_tokenAddress).balanceOf(msg.sender);
        require(balanceAfter >= balanceBefore + _amount, "PersonalTokenFactory: Token minting failed");
        
        // 记录投资到 AthleteRegistry 以更新用户等级
        athleteRegistry.recordInvestment(msg.sender, athlete, discountedCost, _amount);
        
        // 退还多余的ETH
        if (msg.value > totalCost) {
            payable(msg.sender).transfer(msg.value - totalCost);
        }
    }

    // 查询函数
    function getAthleteToken(address _athlete) external view returns (TokenInfo memory) {
        return athleteTokens[_athlete];
    }

    function getTokenAthlete(address _token) external view returns (address) {
        return tokenToAthlete[_token];
    }

    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }

    function getTokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function isTokenActive(address _athlete) external view returns (bool) {
        return athleteTokens[_athlete].isActive;
    }

    /**
     * @dev 授权升级函数
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev 接收ETH
     */
    receive() external payable {}
}