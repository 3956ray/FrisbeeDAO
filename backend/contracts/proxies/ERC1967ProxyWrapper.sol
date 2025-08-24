// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// A thin wrapper so Hardhat emits a local artifact we can deploy easily
contract ERC1967ProxyWrapper is ERC1967Proxy {
    constructor(address implementation, bytes memory _data)
        ERC1967Proxy(implementation, _data)
    {}
}