// contracts/MyContract.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";


import "./Inventory.sol";
import "./Token.sol";
import "./Farm.sol";
// import "./Uniswap.sol";
import "./GameOwner.sol";
import "./InventoryTokenWrapper.sol";

contract SunflowerLandSession is Ownable, GameOwner {
    using ECDSA for bytes32;

    event SessionChanged(address indexed owner, bytes32 indexed sessionId, uint indexed farmId);


    mapping(bytes32 => bool) public executed;

    // Farm ID to saved timestamp
    mapping(uint => bytes32) public sessions;
    mapping(uint => uint) public syncedAt;

    function deposit() external payable {}

    address private signer;
    address private syncFeeWallet;
    address private withdrawFeeWallet;
    address private wishingWell;

    // 0.1
    uint private syncFee = 1 * (10 ** 17);

    // 30% of the fee goes into the wishing well
    uint private wishingWellTax = 30;

    // Whether to liquidate fees instead of sending SFL token
    bool private liquify = false;

    SunflowerLandInventory inventory;
    SunflowerLandToken token;
    SunflowerLand farm;
    SunflowerLandTokenWrapper tokenWrapper;

    // Enable for deploy - disable for testing
    //IUniswapV2Router02 public immutable uniswapV2Router;

    constructor(SunflowerLandInventory _inventory, SunflowerLandToken _token, SunflowerLand _farm, SunflowerLandTokenWrapper _tokenWrapper) payable {
        inventory = _inventory;
        token = _token;
        farm = _farm;
        tokenWrapper = _tokenWrapper;
        signer = _msgSender();
        syncFeeWallet = _msgSender();
        withdrawFeeWallet = _msgSender();

        // Enable for deploy - disable for testing
        //uniswapV2Router = IUniswapV2Router02(0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff);
    }

    function destroy() public onlyOwner payable {
        address payable addr = payable(address(owner()));
        selfdestruct(addr);
    }

    function transferSigner(address _signer) public onlyOwner {
        signer = _signer;
    }

    function transferSyncFeeWallet(address _team) public onlyOwner {
        syncFeeWallet = _team;
    }

    function transferWithdrawFeeWallet(address _team) public onlyOwner {
        withdrawFeeWallet = _team;
    }

    function setSyncFee(uint _fee) public onlyOwner {
        syncFee = _fee;
    }

    function setWishingWellTax(uint _tax) public onlyOwner {
        wishingWellTax = _tax;
    }

    function setLiquify(bool _liquify) public onlyOwner {
        liquify = _liquify;
    }

    function setWishingWell(address _wishingWell) public onlyOwner {
        wishingWell = _wishingWell;
    }


    function getSyncedAt(uint tokenId) public view returns(uint) {
        return syncedAt[tokenId];
    }

    // A unique nonce identifer for the account
    function generateSessionId(uint tokenId) private view returns(bytes32) {
        return keccak256(abi.encodePacked(_msgSender(), sessions[tokenId], block.number)).toEthSignedMessageHash();
    }

    function getSessionId(uint tokenId) public view returns(bytes32) {
        bytes32 id = sessions[tokenId];

        if (id == 0) {
            // First ID is based on the unique contract
            id = keccak256(abi.encode(address(this)));
        }

        return id;
    }

    struct Session {
        bytes32 id;
        uint256 syncedAt;
    }

    function getSession(uint tokenId) public view returns (Session memory ) {
        return Session({
            id: getSessionId(tokenId),
            syncedAt: syncedAt[tokenId]
        });
    }

    function updateSession(uint tokenId) public onlyGame returns(bool) {
        sessions[tokenId] =  generateSessionId(tokenId);
        return true;
    }

    function verify(bytes32 hash, bytes memory signature) private view returns (bool) {
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();
        return ethSignedHash.recover(signature) == signer;
    }

    modifier isReady(uint farmId) {
        require(syncedAt[farmId] < block.timestamp - 15, "SunflowerLand: Too many requests");
        _;
    }

    function syncSignature(
        bytes32 sessionId,
        uint farmId,
        uint deadline,
        uint256[] memory mintIds,
        uint256[] memory mintAmounts,
        uint256[] memory burnIds,
        uint256[] memory burnAmounts,
        int256 tokens
    ) private view returns(bytes32 success) {
        /**
         * Distinct order and abi.encode to avoid hash collisions
         */
        return keccak256(abi.encode(sessionId, tokens, farmId, mintIds, mintAmounts, _msgSender(), burnIds, burnAmounts, deadline));
    }
    
    /**
     * Bring off chain data on chain
     */
    function sync(
        // Verification
        bytes memory signature,
        bytes32 sessionId,
        uint deadline,
        // Data
        uint farmId,
        uint256[] memory mintIds,
        uint256[] memory mintAmounts,
        uint256[] memory burnIds,
        uint256[] memory burnAmounts,
        int256 tokens
    ) public payable isReady(farmId) returns(bool success) {
       require(msg.value >= syncFee, "SunflowerLand: Missing fee");
       require(deadline >= block.timestamp, "SunflowerLand: Deadline Passed");

        // Check the session is new or has not changed (already saved or withdrew funds)
        bytes32 farmSessionId = getSessionId(farmId);
        require(
            farmSessionId == sessionId,
            "SunflowerLand: Session has changed"
        );

        // Start a new session
        bytes32 newSessionId = generateSessionId(farmId);
        sessions[farmId] = newSessionId;
        syncedAt[farmId] = block.timestamp;

        // Verify
        bytes32 txHash = syncSignature(sessionId, farmId, deadline, mintIds, mintAmounts, burnIds, burnAmounts, tokens);
        require(!executed[txHash], "SunflowerLand: Tx Executed");
        require(verify(txHash, signature), "SunflowerLand: Unauthorised");
        executed[txHash] = true;

        // Get the holding address of the farm
        Farm memory farmNFT = farm.getFarm(farmId);

        // Check they own the farm
        require(
            farmNFT.owner == _msgSender(),
            "SunflowerLand: You do not own this farm"
        );

        updateBalance(farmNFT.account, mintIds, mintAmounts, burnIds, burnAmounts, tokens);

        (bool teamSent,) = syncFeeWallet.call{value: msg.value}("");
        require(teamSent, "SunflowerLand: Fee Failed");

        emit SessionChanged(farmNFT.owner, newSessionId, farmId);

        return true;
    }

    function updateBalance(
        address account,
        uint256[] memory mintIds,
        uint256[] memory mintAmounts,
        uint256[] memory burnIds,
        uint256[] memory burnAmounts,
        int256 tokens
    ) private {
        if (mintIds.length > 0) {
            inventory.gameMint(account, mintIds, mintAmounts, "");
        }

        if (burnIds.length > 0) {
            inventory.gameBurn(account, burnIds, burnAmounts);
        }

        if (tokens > 0) {
            token.gameMint(account, uint256(tokens));
        }
        
        if (tokens < 0) {
            // Send to the burn address so total supply keeps increasing
            token.gameTransfer(account, 0x000000000000000000000000000000000000dEaD, uint256(-tokens));
        }
    }

    function withdraw(
        // Verification
        bytes memory signature,
        bytes32 sessionId,
        uint deadline,
        // Data
        uint farmId,
        uint256[] memory ids,
        uint256[] memory amounts,
        uint256 sfl,
        uint256 tax
    ) public isReady(farmId) returns (bool) {
       require(deadline >= block.timestamp, "SunflowerLand: Deadline Passed");

        // Check the session is new or has not changed (already saved or withdrew funds)
        bytes32 farmSessionId = getSessionId(farmId);
        require(
            farmSessionId == sessionId,
            "SunflowerLand: Session has changed"
        );

        // Start a new session
        bytes32 newSessionId = generateSessionId(farmId);
        sessions[farmId] = newSessionId;
        syncedAt[farmId] = block.timestamp;

        // Verify
        bytes32 txHash = keccak256(abi.encode(sessionId, deadline, _msgSender(), farmId, ids, amounts, sfl, tax));
        require(!executed[txHash], "SunflowerLand: Tx Executed");
        require(verify(txHash, signature), "SunflowerLand: Unauthorised");
        executed[txHash] = true;

        // Get the holding address of the farm
        Farm memory farmNFT = farm.getFarm(farmId);

        // Check they own the farm
        require(
            farmNFT.owner == _msgSender(),
            "SunflowerLand: You do not own this farm"
        );

        // Distribution fee
        uint teamFee = sfl * tax / 1000;
        takeFee(farmNFT.account, teamFee);

        // Withdraw from farm
        uint remaining = sfl - teamFee;
        inventory.gameTransferFrom(farmNFT.account, _msgSender(), ids, amounts, "");
        // inventory.gameTransferFrom(_msgSender(), address(tokenWrapper), ids, amounts, "");
        token.gameTransfer(farmNFT.account, _msgSender(), remaining);

        emit SessionChanged(farmNFT.owner, newSessionId, farmId);

        return true;
    }

    function withdrawResources(
        // Verification
        bytes memory signature,
        bytes32 sessionId,
        uint deadline,
        // Data
        uint farmId,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes calldata itemData
    ) public isReady(farmId) returns (bool) {
       require(deadline >= block.timestamp, "SunflowerLand: Deadline Passed");

        // Check the session is new or has not changed (already saved or withdrew funds)
        bytes32 farmSessionId = getSessionId(farmId);
        require(
            farmSessionId == sessionId,
            "SunflowerLand: Session has changed"
        );

        // Start a new session
        bytes32 newSessionId = generateSessionId(farmId);
        sessions[farmId] = newSessionId;
        syncedAt[farmId] = block.timestamp;

        // // Verify
        bytes32 txHash = keccak256(abi.encode(sessionId, deadline, _msgSender(), farmId, ids, amounts, itemData));
        require(!executed[txHash], "SunflowerLand: Tx Executed");
        require(verify(txHash, signature), "SunflowerLand: Unauthorised");
        executed[txHash] = true;

        // Get the holding address of the farm
        Farm memory farmNFT = farm.getFarm(farmId);

        // Check they own the farm
        require(
            farmNFT.owner == _msgSender(),
            "SunflowerLand: You do not own this farm"
        );

        // Withdraw NFTs from farm
        inventory.gameTransferFrom(farmNFT.account, _msgSender(), ids, amounts, itemData);
        // Tokenize NFTs
        inventory.gameTransferFrom(_msgSender(), address(tokenWrapper), ids, amounts, itemData);

        emit SessionChanged(farmNFT.owner, newSessionId, farmId);

        return true;
    }

    function takeFee(address from, uint amount) private {
        token.gameTransfer(from, address(this), amount);

        uint wishingWellFee = amount * wishingWellTax / 100;
        uint remaining = amount - wishingWellFee;

        token.transfer(wishingWell, wishingWellFee);

        if (liquify) {
            // Enable for deploy - disable for testing
            //liquidate(remaining);
        } else {
            token.transfer(withdrawFeeWallet, remaining);
        }
    }

    // Enable for deploy - disable for testing

    // function liquidate(uint amount) private {
    //     token.approve(address(uniswapV2Router), amount);

    //     address[] memory path = new address[](2);
    //     path[0] = address(token);
    //     path[1] = uniswapV2Router.WETH();

    //     // make the swap
    //     uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
    //         amount,
    //         0, // accept any amount of ETH
    //         path,
    //         withdrawFeeWallet,
    //         block.timestamp
    //     );
    // }
}