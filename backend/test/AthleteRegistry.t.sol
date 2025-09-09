// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../contracts/AthleteRegistry.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract AthleteRegistryTest is Test {
    AthleteRegistry public athleteRegistry;
    address public owner;
    address public athlete1;
    address public athlete2;
    address public verifier1;
    address public verifier2;
    address public unauthorizedUser;
    
    uint256 constant REGISTRATION_FEE = 0.01 ether;
    uint256 constant INITIAL_REPUTATION_SCORE = 500;
    uint256 constant MAX_REPUTATION_SCORE = 1000;
    uint256 constant MIN_REPUTATION_SCORE = 0;
    
    function setUp() public {
        owner = address(this);
        athlete1 = makeAddr("athlete1");
        athlete2 = makeAddr("athlete2");
        verifier1 = makeAddr("verifier1");
        verifier2 = makeAddr("verifier2");
        unauthorizedUser = makeAddr("unauthorizedUser");
        
        // 部署實現合約
        AthleteRegistry implementation = new AthleteRegistry();
        
        // 準備初始化數據
        bytes memory initData = abi.encodeWithSelector(
            AthleteRegistry.initialize.selector,
            owner,
            REGISTRATION_FEE
        );
        
        // 部署代理合約
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );
        
        athleteRegistry = AthleteRegistry(address(proxy));
    }
    
    function testInitialization() public {
        assertEq(athleteRegistry.owner(), owner);
        assertEq(athleteRegistry.registrationFee(), REGISTRATION_FEE);
        assertEq(athleteRegistry.MAX_REPUTATION_SCORE(), MAX_REPUTATION_SCORE);
        assertEq(athleteRegistry.MIN_REPUTATION_SCORE(), MIN_REPUTATION_SCORE);
        assertEq(athleteRegistry.INITIAL_REPUTATION_SCORE(), INITIAL_REPUTATION_SCORE);
        assertEq(athleteRegistry.MIN_LEVEL(), 1);
        assertEq(athleteRegistry.MAX_LEVEL(), 10);
    }
    
    function testLevelConfigurations() public {
        // 測試等級1配置
        AthleteRegistry.LevelConfig memory config1 = athleteRegistry.getLevelConfig(1);
        assertEq(config1.requiredInvestment, 0);
        assertEq(config1.discountPercentage, 0);
        assertEq(config1.levelName, "Bronze");
        assertTrue(config1.isActive);
        
        // 測試等級2配置
        AthleteRegistry.LevelConfig memory config2 = athleteRegistry.getLevelConfig(2);
        assertEq(config2.requiredInvestment, 0.1 ether);
        assertEq(config2.discountPercentage, 100); // 1%
        assertEq(config2.levelName, "Silver");
        assertTrue(config2.isActive);
        
        // 測試等級10配置
        AthleteRegistry.LevelConfig memory config10 = athleteRegistry.getLevelConfig(10);
        assertEq(config10.requiredInvestment, 100 ether);
        assertEq(config10.discountPercentage, 2000); // 20%
        assertEq(config10.levelName, "Mythic");
        assertTrue(config10.isActive);
    }
    
    function testAddVerifier() public {
        vm.expectEmit(true, true, false, true);
        emit AthleteRegistry.VerifierAdded(verifier1, "Test Verifier");
        
        athleteRegistry.addVerifier(verifier1, "Test Verifier");
        
        AthleteRegistry.Verifier memory verifierInfo = athleteRegistry.getVerifier(verifier1);
        assertTrue(verifierInfo.isActive);
        assertEq(verifierInfo.organization, "Test Verifier");
        assertEq(verifierInfo.verificationCount, 0);
    }
    
    function testAddVerifierUnauthorized() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        athleteRegistry.addVerifier(verifier1, "Test Verifier");
    }
    
    function testAddDuplicateVerifier() public {
        athleteRegistry.addVerifier(verifier1, "Test Verifier");
        
        vm.expectRevert("AthleteRegistry: Verifier already exists");
        athleteRegistry.addVerifier(verifier1, "Duplicate Verifier");
    }
    
    function testAddZeroAddressVerifier() public {
        vm.expectRevert("AthleteRegistry: Invalid verifier address");
        athleteRegistry.addVerifier(address(0), "Invalid Verifier");
    }
    
    function testRemoveVerifier() public {
        athleteRegistry.addVerifier(verifier1, "Test Verifier");
        
        vm.expectEmit(true, false, false, true);
        emit AthleteRegistry.VerifierRemoved(verifier1);
        
        athleteRegistry.removeVerifier(verifier1);
        
        AthleteRegistry.Verifier memory verifierInfo = athleteRegistry.getVerifier(verifier1);
        assertFalse(verifierInfo.isActive);
    }
    
    function testRemoveNonexistentVerifier() public {
        vm.expectRevert("AthleteRegistry: Verifier not found");
        athleteRegistry.removeVerifier(verifier2);
    }
    
    function testRemoveVerifierUnauthorized() public {
        athleteRegistry.addVerifier(verifier1, "Test Verifier");
        
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        athleteRegistry.removeVerifier(verifier1);
    }
    
    function testGetVerifierList() public {
        athleteRegistry.addVerifier(verifier1, "Verifier 1");
        athleteRegistry.addVerifier(verifier2, "Verifier 2");
        
        address[] memory verifierList = athleteRegistry.getVerifierList();
        assertEq(verifierList.length, 2);
        
        bool found1 = false;
        bool found2 = false;
        for (uint i = 0; i < verifierList.length; i++) {
            if (verifierList[i] == verifier1) found1 = true;
            if (verifierList[i] == verifier2) found2 = true;
        }
        assertTrue(found1);
        assertTrue(found2);
        
        assertEq(athleteRegistry.getVerifierCount(), 2);
    }
    
    function testGetVerifier() public {
        string memory organization = "Test Organization";
        athleteRegistry.addVerifier(verifier1, organization);
        
        AthleteRegistry.Verifier memory verifierInfo = athleteRegistry.getVerifier(verifier1);
        assertTrue(verifierInfo.isActive);
        assertEq(verifierInfo.organization, organization);
        assertEq(verifierInfo.verificationCount, 0);
    }
    
    function testGetAllLevelConfigs() public {
        AthleteRegistry.LevelConfig[] memory configs = athleteRegistry.getAllLevelConfigs();
        assertEq(configs.length, 10);
        
        // 檢查第一個等級
        assertEq(configs[0].requiredInvestment, 0);
        assertEq(configs[0].discountPercentage, 0);
        assertEq(configs[0].levelName, "Bronze");
        assertTrue(configs[0].isActive);
        
        // 檢查最後一個等級
        assertEq(configs[9].requiredInvestment, 100 ether);
        assertEq(configs[9].discountPercentage, 2000);
        assertEq(configs[9].levelName, "Mythic");
        assertTrue(configs[9].isActive);
    }
}