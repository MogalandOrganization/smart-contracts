// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../lib/DSMath.sol";

contract MogaStaking is Ownable, Pausable, ReentrancyGuard, DSMath {
    using SafeERC20 for ERC20Burnable;

    ERC20Burnable token;

    uint256 public totalStaked = 0;
    uint256 public totalInterest = 0;

    /**
     * @dev
     *
     */
    struct StakeOffer {
        uint256 rate;
        uint256 fee; // unstake fee
        uint256 lockupDuration; //
        bool active;
        bool onlyAdmin;
    }

    struct Stake {
        uint256 offerId;
        uint256 principle;
        uint256 created;
        address owner;
    }

    uint256[] private allStakeOfferIds;
    mapping(uint256 => StakeOffer) public stakeOffers;

    uint256[] private stakeIds;
    mapping(uint256 => Stake) public stakes;
    mapping(uint256 => uint256) public stakeIdToStakeOffer;
    mapping(address => uint256) private holdersStakingCount;
    mapping(address => uint256[]) private holderToStakeIds;

    event StakeOfferCreated(uint256 _stakeOfferId);
    event StakeOfferDiscontinued(uint256 _stakeOfferId);
    event Deposit(address _address, uint256 _amount, uint256 _stakeId);
    event Withdraw(address _address, uint256 _amount);
    event Claim(address _address, uint256 _amount);

    error StakeOfferNotActive(uint256 _stakeOfferId);
    error StakeOfferNotAccessible(uint256 _stakeOfferId);
    error StakeBalanceIsZero(uint256 _stakeId);
    error StakeIsLocked(uint256 _stakeId);
    error InvalidAmount(uint256 _amount);
    error InvalidOwner(uint256 _stakeId);

    // Flexible Staking logic
    /**
     * @dev
     * variables related to the flexible staking mechanism
     *
     */
    uint256 flexibleRewardRate = 0;
    uint256 flexibleFee = 0;

    mapping(address => uint256) public flexibleBalanceOf;
    mapping(address => uint256) public flexibleLastUpdated;

    event FlexibleRewardRateModified(uint256 _newRate);
    event FlexibleFeeModified(uint256 _newFee);
    event DepositFlexible(address _address, uint256 _amount);
    event WithdrawFlexible(address _address, uint256 _amount);
    event CompoundFlexible(address _address, uint256 _amount);

    error FlexibleRewardRateInvalid(uint256 _rate);
    error FlexibleFeeInvalid(uint256 _fee);
    error FlexibleStakeBalanceIsZero(address _address);

    constructor(address initialOwner, address token_) Ownable(initialOwner) {
        token = ERC20Burnable(token_);
    }

    //// Fixed point scale factors
    // wei -> the base unit
    // wad -> wei * 10 ** 18. 1 ether = 1 wad, so 0.5 ether can be used
    //      to represent a decimal wad of 0.5
    // ray -> wei * 10 ** 27

    // Go from wad (10**18) to ray (10**27)
    function wadToRay(uint _wad) internal pure returns (uint) {
        return mul(_wad, 10 ** 9);
    }

    // Go from wei to ray (10**27)
    function weiToRay(uint _wei) internal pure returns (uint) {
        return mul(_wei, 10 ** 27);
    }

    /**
     * @dev Uses an approximation of continuously compounded interest
     * (discretely compounded every second)
     * @param _principal The principal to calculate the interest on.
     *   Accepted in wei.
     * @param _rate The interest rate. Accepted as a ray representing
     *   1 + the effective interest rate per second, compounded every
     *   second. As an example:
     *   I want to accrue interest at a nominal rate (i) of 5.0% per year
     *   compounded continuously. (Effective Annual Rate of 5.127%).
     *   This is approximately equal to 5.0% per year compounded every
     *   second (to 8 decimal places, if max precision is essential,
     *   calculate nominal interest per year compounded every second from
     *   your desired effective annual rate). Effective Rate Per Second =
     *   Nominal Rate Per Second compounded every second = Nominal Rate
     *   Per Year compounded every second * conversion factor from years
     *   to seconds
     *   Effective Rate Per Second = 0.05 / (365 days/yr * 86400 sec/day) = 1.5854895991882 * 10 ** -9
     *   The value we want to send this function is
     *   1 * 10 ** 27 + Effective Rate Per Second * 10 ** 27
     *   = 1000000001585489599188229325
     *   This will return 5.1271096334354555 Dai on a 100 Dai principal
     *   over the course of one year (31536000 seconds)
     * @param _age The time period over which to accrue interest. Accepted
     *   in seconds.
     * @return The new principal as a wad. Equal to original principal +
     *   interest accrued
     */
    function accrueInterest(
        uint _principal,
        uint _rate,
        uint _age
    ) external pure returns (uint) {
        return _accrueInterest(_principal, _rate, _age);
    }

    function _accrueInterest(
        uint _principal,
        uint _rate,
        uint _age
    ) internal pure returns (uint) {
        return rmul(_principal, rpow(_rate, _age));
    }

    /**
     * @dev Takes in the desired nominal interest rate per year, compounded
     *   every second (this is approximately equal to nominal interest rate
     *   per year compounded continuously). Returns the ray value expected
     *   by the accrueInterest function
     * @param _rateWad A wad of the desired nominal interest rate per year,
     *   compounded continuously. Converting from ether to wei will effectively
     *   convert from a decimal value to a wad. So 5% rate = 0.05
     *   should be input as yearlyRateToRay( 0.05 ether )
     * @return 1 * 10 ** 27 + Effective Interest Rate Per Second * 10 ** 27
     */
    function yearlyRateToRay(uint _rateWad) external pure returns (uint) {
        return _yearlyRateToRay(_rateWad);
    }

    function _yearlyRateToRay(uint _rateWad) internal pure returns (uint) {
        return
            add(
                wadToRay(1 ether),
                rdiv(wadToRay(_rateWad), weiToRay(365 * 86400))
            );
    }

    function setNewFlexibleRewardRate(uint256 _rate) public onlyOwner {
        if (_rate <= 0) {
            revert FlexibleRewardRateInvalid(_rate);
        }
        flexibleRewardRate = _yearlyRateToRay(_rate);
        emit FlexibleRewardRateModified(flexibleRewardRate);
    }

    function setNewFlexibleRewardFee(uint256 _fee) public onlyOwner {
        if (_fee <= 0) {
            revert FlexibleFeeInvalid(_fee);
        }
        flexibleFee = _fee;
        emit FlexibleFeeModified(_fee);
    }

    /**
     * @dev This function is called for plain Ether transfers, i.e. for every call with empty calldata.
     */
    receive() external payable {}

    /**
     * @dev Fallback function is executed if none of the other functions match the function
     * identifier or no data was provided with the function call.
     */
    fallback() external payable {}

    /**
     * @dev Returns the total number of rewards available
     * @return the amount of tokens
     */
    function totalRewards() external view returns (uint256) {
        return _totalRewards();
    }

    function _totalRewards() internal view returns (uint256) {
        return token.balanceOf(address(this)) - totalStaked - totalInterest;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @notice Withdraw the specified amount if possible.
     * @param amount the amount to withdraw
     */
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(
            getWithdrawableAmount() >= amount,
            "TokenStaking: not enough withdrawable funds"
        );
        token.safeTransfer(msg.sender, amount);
    }

    function createStakeOffer(
        uint256 _rate,
        uint256 _fee,
        uint256 _lockupDuration,
        bool _onlyAdmin
    ) external onlyOwner {
        require(_lockupDuration > 0, "lockup duration must be > 0");
        require(_rate > 0, "reward rate must be > 0");
        uint256 stakeOfferId = allStakeOfferIds.length + 1;
        stakeOffers[stakeOfferId] = StakeOffer(
            _rate,
            _fee,
            _lockupDuration,
            true,
            _onlyAdmin
        );
        allStakeOfferIds.push(stakeOfferId);
        emit StakeOfferCreated(stakeOfferId);
    }

    function getAllStakeOfferIds() external view returns (uint256[] memory) {
        return allStakeOfferIds;
    }

    function discontinueStakeOffer(uint256 _stakeOfferId) external onlyOwner {
        stakeOffers[_stakeOfferId].active = false;
        emit StakeOfferDiscontinued(_stakeOfferId);
    }

    function getStakeDetails(
        uint256 _stakeId
    ) external view returns (Stake memory) {
        return stakes[_stakeId];
    }

    function stakeFixedTerm(
        uint256 _stakeOfferId,
        uint256 _amount
    ) external whenNotPaused nonReentrant {
        if (stakeOffers[_stakeOfferId].active == false) {
            revert StakeOfferNotActive(_stakeOfferId);
        }
        if (stakeOffers[_stakeOfferId].onlyAdmin == true) {
            revert StakeOfferNotAccessible(_stakeOfferId);
        }
        if (_amount < 0) {
            revert InvalidAmount(_amount);
        }
        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 stakeId = stakeIds.length + 1;
        stakes[stakeId] = Stake(
            _stakeOfferId,
            _amount,
            block.timestamp,
            msg.sender
        );
        stakeIdToStakeOffer[stakeId] = _stakeOfferId;
        holderToStakeIds[msg.sender].push(stakeId);
        stakeIds.push(stakeId);

        uint256 rewardRate = stakeOffers[_stakeOfferId].rate;
        uint256 duration = stakeOffers[_stakeOfferId].lockupDuration;

        uint256 ray = _yearlyRateToRay(rewardRate);

        totalStaked += _amount;
        totalInterest += _accrueInterest(_amount, ray, duration) - _amount;
        emit Deposit(msg.sender, _amount, stakeId);
    }

    /**
     * @dev admins can stake on behalf of a beneficiary, e.g. when airdropping tokens
     * these are locked up until the stake duration is over
     */
    function stakeFixedTermForBeneficiary(
        uint256 _stakeOfferId,
        uint256 _amount,
        address _beneficiary
    ) external onlyOwner whenNotPaused nonReentrant {
        if (stakeOffers[_stakeOfferId].active == false) {
            revert StakeOfferNotActive(_stakeOfferId);
        }
        if (_amount < 0) {
            revert InvalidAmount(_amount);
        }
        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 stakeId = stakeIds.length + 1;
        stakes[stakeId] = Stake(
            _stakeOfferId,
            _amount,
            block.timestamp,
            _beneficiary
        );
        stakeIdToStakeOffer[stakeId] = _stakeOfferId;
        holderToStakeIds[_beneficiary].push(stakeId);
        stakeIds.push(stakeId);

        uint256 rewardRate = stakeOffers[_stakeOfferId].rate;
        uint256 duration = stakeOffers[_stakeOfferId].lockupDuration;

        uint256 ray = _yearlyRateToRay(rewardRate);

        totalStaked += _amount;
        totalInterest += _accrueInterest(_amount, ray, duration);
        emit Deposit(_beneficiary, _amount, stakeId);
    }

    /**
     * @dev unStake checks eligibility and takes the pre-determined fee into considerations
     * 50% of unstake fee goes back to the staking contract
     * 50% of unstake fee is burned according to whitepaper
     */
    function unStakeFixedTerm(uint256 _stakeId) external nonReentrant {
        if (stakes[_stakeId].owner != msg.sender) {
            revert InvalidOwner(_stakeId);
        }
        if (stakes[_stakeId].principle <= 0) {
            revert StakeBalanceIsZero(_stakeId);
        }
        if (
            (block.timestamp - stakes[_stakeId].created) <=
            stakeOffers[stakeIdToStakeOffer[_stakeId]].lockupDuration
        ) {
            revert StakeIsLocked(_stakeId);
        }

        uint256 balance = _rewards(_stakeId);
        uint256 initialStake = stakes[_stakeId].principle;

        uint256 afterFee;

        uint256 fee = stakeOffers[stakeIdToStakeOffer[_stakeId]].fee;
        if (fee > 0) {
            uint256 diff = balance - initialStake;
            uint256 feeAmount = (diff * (100 - fee)) / 1000;
            afterFee = balance - feeAmount; //

            // burn half of fee
            uint256 burnAmount = feeAmount / 2;
            token.burn(burnAmount);
        } else afterFee = balance;

        // we only transfer amount afterFees and 50% of that remains inaccessible in staking pool
        token.safeTransfer(msg.sender, afterFee);
        stakes[_stakeId].principle = 0;

        totalStaked -= initialStake;
        totalInterest -= balance - initialStake;
        emit Withdraw(msg.sender, afterFee);
    }

    function rewards(uint256 _stakeId) external view returns (uint256) {
        return _rewards(_stakeId);
    }

    /**
     * @dev take duration since last update, multiply by account balance and
     * divide by rate multiplied by 1 hour (3600)
     *
     */
    function _rewards(uint256 _stakeId) internal view returns (uint256) {
        // make sure stake is only calculated against committed timestamp
        Stake storage stake = stakes[_stakeId];

        uint256 principle = stake.principle;
        uint256 duration = stakeOffers[stakeIdToStakeOffer[_stakeId]]
            .lockupDuration;
        uint256 stakeEndTime = stake.created + duration;
        uint256 rewardRate = stakeOffers[stakeIdToStakeOffer[_stakeId]].rate;

        uint256 ray = _yearlyRateToRay(rewardRate);

        if (stakeEndTime > block.timestamp) {
            return
                _accrueInterest(
                    principle,
                    ray,
                    block.timestamp - stake.created
                );
        } else {
            return _accrueInterest(principle, ray, duration);
        }
    }

    /**
     * @dev Returns all stakeIds.
     * @return array of all stakeIds.
     */
    function getAllStakeIds() external view returns (uint256[] memory) {
        return stakeIds;
    }

    function getAllStakeIdsOfAddress(
        address _address
    ) external view returns (uint256[] memory stakeIdsOfOwner) {
        return holderToStakeIds[_address];
    }

    /**
     * @dev Returns the current time.
     * @return the current timestamp in seconds.
     */
    function getCurrentTime() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    /**
     * @dev Returns the amount of tokens that can be withdrawn by the owner.
     * @return the amount of tokens
     */
    function getWithdrawableAmount() public view returns (uint256) {
        return token.balanceOf(address(this)) - totalStaked;
    }

    // flexible staking logic
    function stakeFlexible(uint256 amount_) external {
        _stakeFlexible(amount_);
    }

    function _stakeFlexible(uint256 amount_) internal {
        token.safeTransferFrom(msg.sender, address(this), amount_);
        flexibleBalanceOf[msg.sender] += amount_;
        flexibleLastUpdated[msg.sender] = block.timestamp;
        totalStaked += amount_;
        emit DepositFlexible(msg.sender, amount_);
    }

    function rewardsFlexible(address address_) external view returns (uint256) {
        return _rewardsFlexible(address_);
    }

    function _rewardsFlexible(
        address address_
    ) internal view returns (uint256) {
        uint256 duration = block.timestamp - flexibleLastUpdated[address_];
        uint256 principle = flexibleBalanceOf[address_];

        return _accrueInterest(principle, flexibleRewardRate, duration);
    }

    /**
     * @dev Anyone can execute the compoundFlexible method to enable automatic backend systems
     * Prior to modifying the flexibleRewardRate it is required that backend executes compounding on
     * behalf of all active flexible stakers
     * Since the rewardRate and fee are both flexible, every compounding needs to calculate and burn fees accordingly
     */
    function compoundFlexible(address _beneficiary) external nonReentrant {
        _compoundFlexible(_beneficiary);
    }

    function _compoundFlexible(address _beneficiary) internal {
        uint256 balance = _rewardsFlexible(_beneficiary);
        uint256 initialStake = flexibleBalanceOf[_beneficiary];

        uint256 afterFee;
        uint256 burnAmount;

        if (flexibleFee > 0) {
            uint256 diff = balance - initialStake;
            uint256 feeAmount = (diff * (100 - flexibleFee)) / 1000;
            afterFee = balance - feeAmount; //

            // burn half of fee
            burnAmount = feeAmount / 2;
            token.burn(burnAmount);
        } else afterFee = balance;

        flexibleBalanceOf[_beneficiary] = afterFee;
        flexibleLastUpdated[_beneficiary] = block.timestamp;
        totalStaked -= initialStake;
        totalStaked += afterFee;
        emit CompoundFlexible(_beneficiary, afterFee);
    }

    /**
     * @dev withdrawing the full flexible staked amount
     * resetting flexibleBalance to zero
     */
    function withdrawFlexible() external nonReentrant {
        if (flexibleBalanceOf[msg.sender] <= 0) {
            revert FlexibleStakeBalanceIsZero(msg.sender);
        }

        _compoundFlexible(msg.sender);
        uint256 amount = flexibleBalanceOf[msg.sender];
        flexibleBalanceOf[msg.sender] = 0;
        totalStaked -= amount;
        token.safeTransfer(msg.sender, amount);
        emit WithdrawFlexible(msg.sender, amount);
    }
}
