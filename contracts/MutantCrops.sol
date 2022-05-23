// contracts/MyContract.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

import "./GameOwner.sol";

import "./Inventory.sol";
import "./Farm.sol";

contract MutantCrops is GameOwner, ERC721Enumerable {
    using ECDSA for bytes32;

    mapping(bytes32 => bool) public executed;

    // Farm ID to saved timestamp
    mapping(uint => uint) public mintedAt;

    uint private inventoryId = 912;

    address private signer;

    SunflowerLandInventory inventory;
    SunflowerLand farm;

    string private baseURI = "https://sunflower-land.com/play/nfts/mutant-crops/";

    constructor(SunflowerLandInventory _inventory, SunflowerLand _farm) ERC721("Sunflower Land Mutant Crop", "SLM") {
        inventory = _inventory;
        farm = _farm;
        signer = _msgSender();
        addGameRole(_msgSender());
    }

    function setBaseUri(string memory uri) public onlyOwner {
        baseURI = uri;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function transferSigner(address _signer) public onlyOwner {
        signer = _signer;
    }

    function verify(bytes32 hash, bytes memory signature) private view returns (bool) {
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();
        return ethSignedHash.recover(signature) == signer;
    }

    function mintSignature(
        uint256 deadline,
        uint256 cropId,
        uint256 farmId
    ) private view returns(bytes32 success) {
        /**
         * Distinct order and abi.encode to avoid hash collisions
         */
        return keccak256(abi.encode(deadline, _msgSender(), cropId, farmId));
    }

    function mint(
        // Verification
        bytes memory signature,
        uint256 deadline,
        // Data
        uint256 cropId,
        uint256 farmId
    ) external returns(bool success) {
        require(deadline >= block.timestamp, "MutantCrops: Deadline Passed");

        // Verify
        bytes32 txHash = mintSignature(deadline, cropId, farmId);
        require(!executed[txHash], "MutantCrops: Tx Executed");
        require(verify(txHash, signature), "MutantCrops: Unauthorised");
        executed[txHash] = true;

        require(nextMutantCrop() == cropId, "MutantCrops: Crop is not ready");

        Farm memory farmNFT = farm.getFarm(farmId);
        require(farmNFT.owner == _msgSender(), "MutantCrops: You do not own this farm");

        _mint(farmNFT.account, totalSupply() + 1);
        return true;
    }

    /**
     * Cycle evenly one by one through the different crops
     * Sunflower = 0
     * Potato = 1
     * ....
     * Wheat = 9
     */
    function nextMutantCrop() public view returns (uint) {
        return (totalSupply()) % 10;
    }

    /**
     * Update it in the ERC1155 contract
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        // Always let base contracts run first
        super._beforeTokenTransfer(from, to, tokenId);

        bool isMint = from == address(0);

        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);

        // Intialises the only element in the array
        ids[0] = inventoryId;
        amounts[0] = 1;

        if (isMint) {
            // Mint it
            inventory.gameMint(to, ids, amounts, "");
        } else {
            // Move it around
            inventory.gameTransferFrom(from, to, ids, amounts, "");
        }
    }

    /**
     * Withdraw from farm to personal wallet
     */
    function gameTransfer(
        address from,
        address to,
        uint256 tokenId
    ) public onlyGame {
        _transfer(from, to, tokenId);
    }

    function gameMint(
        address to,
        uint256 tokenId
    ) public onlyGame {
        _mint(to, tokenId);
    }
}
