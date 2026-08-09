// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TRC20Token {
    string private _name;
    string private _symbol;
    uint8 private constant _decimals = 18;

    uint256 private _totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(
        address indexed from,
        address indexed to,
        uint256 value
    );

    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialSupply
    ) {
        _name = tokenName;
        _symbol = tokenSymbol;

        uint256 supply = initialSupply * (10 ** uint256(_decimals));

        _totalSupply = supply;
        _balances[msg.sender] = supply;

        emit Transfer(address(0), msg.sender, supply);
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function symbol() external view returns (string memory) {
        return _symbol;
    }

    function decimals() external pure returns (uint8) {
        return _decimals;
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account)
        external
        view
        returns (uint256)
    {
        return _balances[account];
    }

    function transfer(
        address to,
        uint256 amount
    ) external returns (bool) {
        require(
            _balances[msg.sender] >= amount,
            "Insufficient balance"
        );

        _balances[msg.sender] -= amount;
        _balances[to] += amount;

        emit Transfer(msg.sender, to, amount);

        return true;
    }

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(
        address spender,
        uint256 amount
    ) external returns (bool) {
        _allowances[msg.sender][spender] = amount;

        emit Approval(
            msg.sender,
            spender,
            amount
        );

        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(
            _balances[from] >= amount,
            "Insufficient balance"
        );

        require(
            _allowances[from][msg.sender] >= amount,
            "Allowance exceeded"
        );

        _balances[from] -= amount;
        _balances[to] += amount;
        _allowances[from][msg.sender] -= amount;

        emit Transfer(from, to, amount);

        return true;
    }
}
