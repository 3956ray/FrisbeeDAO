// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./AthleteRegistry.sol";

/**
 * @title PersonalToken
 * @dev 运动员个人代币合约
 */
contract PersonalToken is ERC20, Ownable {
    address public athlete;
    address public factory;
    uint256 public basePrice;
    uint256 public baseSupply;
    
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
     * @dev 计算购买代币的成本
     * @param _amount 购买数量
     * @return cost 总成本
     */
    function calculatePurchaseCost(uint256 _amount) public view returns (uint256 cost) {
        uint256 currentSupply = totalSupply();
        
        // 使用积分计算联合曲线下的面积
        // price = basePrice * (supply/baseSupply)^2
        // cost = ∫[currentSupply to currentSupply+amount] basePrice * (x/baseSupply)^2 dx
        
        uint256 supply1 = currentSupply;
        uint256 supply2 = currentSupply + _amount;
        
        // 积分结果: basePrice * (x^3)/(3 * baseSupply^2)
        uint256 integral1 = (basePrice * supply1 * supply1 * supply1) / (3 * baseSupply * baseSupply);
        uint256 integral2 = (basePrice * supply2 * supply2 * supply2) / (3 * baseSupply * baseSupply);
        
        cost = integral2 - integral1;
    }
    
    /**
     * @dev 计算出售代币的退款
     * @param _amount 出售数量
     * @return refund 退款金额
     */
    function calculateSaleRefund(uint256 _amount) public view returns (uint256 refund) {
        uint256 currentSupply = totalSupply();
        require(_amount <= currentSupply, "PersonalToken: Insufficient supply");
        
        uint256 supply1 = currentSupply - _amount;
        uint256 supply2 = currentSupply;
        
        // 同样使用积分计算
        uint256 integral1 = (basePrice * supply1 * supply1 * supply1) / (3 * baseSupply * baseSupply);
        uint256 integral2 = (basePrice * supply2 * supply2 * supply2) / (3 * baseSupply * baseSupply);
        
        refund = integral2 - integral1;
    }
    
    /**
     * @dev 获取当前代币价格
     * @return price 当前价格
     */
    function getCurrentPrice() public view returns (uint256 price) {
        uint256 currentSupply = totalSupply();
        price = (basePrice * currentSupply * currentSupply) / (baseSupply * baseSupply);
    }
    
    /**
     * @dev 购买代币
     * @param _amount 购买数量
     */
    function buyTokens(uint256 _amount) external payable {
        require(_amount > 0, "PersonalToken: Amount must be positive");
        
        uint256 cost = calculatePurchaseCost(_amount);
        require(msg.value >= cost, "PersonalToken: Insufficient payment");
        
        _mint(msg.sender, _amount);
        
        emit TokensPurchased(msg.sender, _amount, cost);
        
        // 退还多余的ETH
        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }
    }
    
    /**
     * @dev 出售代币
     * @param _amount 出售数量
     */
    function sellTokens(uint256 _amount) external {
        require(_amount > 0, "PersonalToken: Amount must be positive");
        require(balanceOf(msg.sender) >= _amount, "PersonalToken: Insufficient balance");
        
        uint256 refund = calculateSaleRefund(_amount);
        require(address(this).balance >= refund, "PersonalToken: Insufficient contract balance");
        
        _burn(msg.sender, _amount);
        payable(msg.sender).transfer(refund);
        
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
    ReentrancyGuardUpgradeable 
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
    ) external payable nonReentrant {
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
     * @dev 提取合约余额
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "PersonalTokenFactory: No funds to withdraw");
        
        payable(owner()).transfer(balance);
    }

    /**
     * @dev 批量购买代币
     * @param _tokenAddress 代币地址
     * @param _amount 购买数量
     */
    function batchBuyTokens(
        address _tokenAddress,
        uint256 _amount
    ) external payable nonReentrant {
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
        
        // 计算平台手续费
        uint256 platformFee = (cost * platformFeePercentage) / 10000;
        uint256 totalCost = cost + platformFee;
        
        require(msg.value >= totalCost, "PersonalTokenFactory: Insufficient payment");
        
        // 向代币合约发送购买成本
        token.buyTokens{value: cost}(_amount);
        
        // 将代币转移给购买者
        IERC20(_tokenAddress).transferFrom(address(this), msg.sender, _amount);
        
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