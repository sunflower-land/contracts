// contracts/MyContract.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./GameOwner.sol";

contract SunflowerLandInventory is ERC1155Supply, GameOwner, Pausable {
    constructor() ERC1155("https://sunflower-land.com/play/erc1155/{id}.json") payable {
        gameRoles[msg.sender] = true;
    }

    function setURI(string memory newuri) public onlyOwner returns (bool) {
        _setURI(newuri);
        return true;
    }

    function gameMint(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public onlyGame returns (bool) {
        _mintBatch(to, ids, amounts, data);
        return true;
    }

    function gameBurn(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts
    ) public onlyGame returns (bool) {
        _burnBatch(to, ids, amounts);
        return true;
    }

    function gameTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public onlyGame returns (bool) {
        _safeBatchTransferFrom(from, to, ids, amounts, data);
        return true;
    }

    function gameSetApproval(
        address owner,
        address operator,
        bool approved
    ) public onlyGame returns (bool) {
        _setApprovalForAll(owner, operator, approved);
        return true;
    }

    /**
     * Fetch supply for multiple tokens
     */
    function totalSupplyBatch(uint256[] memory ids)
        public
        view
        returns (uint256[] memory)
    {
        uint256[] memory batchSupply = new uint256[](ids.length);

        for (uint256 i = 0; i < ids.length; ++i) {
            batchSupply[i] = totalSupply(ids[i]);
        }

        return batchSupply;
    }

    /**
     * @dev See {ERC1155-_beforeTokenTransfer}.
     *
     * Requirements:
     *
     * - the contract must not be paused.
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        require(!paused(), "ERC1155Pausable: token transfer while paused");
    }
}