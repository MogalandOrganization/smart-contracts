// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

import '../lib/DSMath.sol';

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

    uint256 public lastStakeOfferId = 0;
    mapping(uint256 => StakeOffer) public stakeOffers;

    uint256 private lastStakeId = 0;
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
    error InvalidOwner(uint256 _stakeId, address _address);

    // Flexible Staking logic
    /**
     * @dev
     * variables related to the flexible staking mechanism
     * Using time-weighted accumulators for efficient reward tracking
     */
    uint256 public flexibleRewardRate = 0; // Current rate as RAY value
    uint256 public flexibleFee = 0; // Current fee percentage
    uint256 public rewardIndex; // Global accumulator for rewards (starts at RAY = 10^27)
    uint256 public lastIndexUpdateTimestamp; // Last time rewardIndex was updated

    mapping(address => uint256) public flexibleBalanceOf; // User's staked balance
    mapping(address => uint256) public userRewardIndex; // User's snapshot of rewardIndex
    mapping(address => uint256) public userUnclaimedRewards; // User's unclaimed rewards
    address[] private flexibleStakers; // List of all flexible stakers
    mapping(address => uint256) private flexibleStakerIndexes; // Index of each flexible staker in the list

    event FlexibleRewardRateModified(uint256 _newRate);
    event FlexibleFeeModified(uint256 _newFee);
    event DepositFlexible(address _address, uint256 _amount);
    event WithdrawFlexible(address _address, uint256 _amount);
    event CompoundFlexible(address _address, uint256 _amount);
    event RewardIndexUpdated(uint256 _newIndex);

    error FlexibleRewardRateInvalid(uint256 _rate);
    error FlexibleFeeInvalid(uint256 _fee);
    error FlexibleStakeBalanceIsZero(address _address);

    constructor(address initialOwner, address token_) Ownable(initialOwner) {
        token = ERC20Burnable(token_);
        // Initialize rewardIndex to RAY (10^27) which represents 1.0 in ray format
        rewardIndex = wadToRay(1 ether);
        lastIndexUpdateTimestamp = block.timestamp;
        
        // Initialize tracking variables
        totalFlexiblePrincipal = 0;
        reservedFlexibleRewards = 0;
        lastGlobalRewardsSnapshot = 0;
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
    function accrueInterest(uint _principal, uint _rate, uint _age) external pure returns (uint) {
        return _accrueInterest(_principal, _rate, _age);
    }

    function _accrueInterest(uint _principal, uint _rate, uint _age) internal pure returns (uint) {
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
        return add(wadToRay(1 ether), rdiv(wadToRay(_rateWad), weiToRay(365 * 86400)));
    }

    /**
     * @dev Updates the global rewardIndex based on time elapsed and current rate
     * This is called whenever users interact with the contract or rates change
     */
    function updateRewardIndex() internal {
        uint256 currentTime = block.timestamp;
        if (currentTime > lastIndexUpdateTimestamp && flexibleRewardRate > 0) {
            uint256 timeDelta = currentTime - lastIndexUpdateTimestamp;
            // Calculate new index with compound interest formula
            rewardIndex = rmul(rewardIndex, rpow(flexibleRewardRate, timeDelta));
            lastIndexUpdateTimestamp = currentTime;
            emit RewardIndexUpdated(rewardIndex);
        }
    }

    // Track the sum of all unclaimed rewards across all users
    uint256 private lastGlobalRewardsSnapshot;
    
    /**
     * @dev Updates a user's rewards based on their balance and the global index
     * Stores the rewards in the userUnclaimedRewards mapping
     * Manages the reserved rewards tracking in a way that prevents double-counting
     */
    function updateUserRewards(address _user) internal {
        // Get the current sum of all unclaimed rewards before update
        uint256 totalUnclaimedBefore = lastGlobalRewardsSnapshot;
        
        // First update the global index
        uint256 oldRewardIndex = rewardIndex;
        updateRewardIndex();

        // If user has a balance and has a valid index snapshot
        if (flexibleBalanceOf[_user] > 0 && userRewardIndex[_user] > 0) {
            // Calculate new rewards using the index ratio
            uint256 newRewards = rmul(flexibleBalanceOf[_user], rdiv(rewardIndex, userRewardIndex[_user])) - flexibleBalanceOf[_user];
            
            // Add to unclaimed rewards
            userUnclaimedRewards[_user] += newRewards;
        }

        // Update user's index snapshot to current
        userRewardIndex[_user] = rewardIndex;
        
        // Calculate the current sum of all unclaimed rewards
        uint256 userReward = userUnclaimedRewards[_user];
        uint256 newTotalUnclaimed = lastGlobalRewardsSnapshot + userReward;
        
        // Update the reserved rewards accurately
        // Only add the net new rewards generated in this update
        if (newTotalUnclaimed > totalUnclaimedBefore) {
            reservedFlexibleRewards += (newTotalUnclaimed - totalUnclaimedBefore);
        }
        
        // Update the global snapshot
        lastGlobalRewardsSnapshot = newTotalUnclaimed;
    }

    function setNewFlexibleRewardRate(uint256 _rate) public onlyOwner {
        if (_rate <= 0) {
            revert FlexibleRewardRateInvalid(_rate);
        }
        // Update index with old rate before changing
        updateRewardIndex();
        flexibleRewardRate = _yearlyRateToRay(_rate);
        emit FlexibleRewardRateModified(flexibleRewardRate);
    }

    function setNewFlexibleRewardFee(uint256 _fee) public onlyOwner {
        // Allow fee to be 0 (no fee) or greater than 0
        // This prevents reverting when fee is 0, which is a valid value
        if (_fee > 100) {
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
        uint256 withdrawable = getWithdrawableAmount();
        require(withdrawable >= amount, 'TokenStaking: not enough withdrawable funds');
        require(token.balanceOf(address(this)) >= amount, 'TokenStaking: insufficient contract balance');
        token.safeTransfer(msg.sender, amount);
    }

    function createStakeOffer(uint256 _rate, uint256 _fee, uint256 _lockupDuration, bool _onlyAdmin) external onlyOwner {
        require(_lockupDuration > 0, 'lockup duration must be > 0');
        require(_rate > 0, 'reward rate must be > 0');
        uint256 stakeOfferId = lastStakeOfferId + 1;
        stakeOffers[stakeOfferId] = StakeOffer(_rate, _fee, _lockupDuration, true, _onlyAdmin);
        lastStakeOfferId = stakeOfferId;
        emit StakeOfferCreated(stakeOfferId);
    }

    function discontinueStakeOffer(uint256 _stakeOfferId) external onlyOwner {
        stakeOffers[_stakeOfferId].active = false;
        emit StakeOfferDiscontinued(_stakeOfferId);
    }

    function getStakeDetails(uint256 _stakeId) external view returns (Stake memory) {
        Stake memory stake = stakes[_stakeId];
        if (stake.owner != msg.sender && msg.sender != owner()) {
            revert InvalidOwner(_stakeId, msg.sender);
        }
        return stake;
    }

    function stakeFixedTerm(uint256 _stakeOfferId, uint256 _amount) external whenNotPaused nonReentrant {
        if (stakeOffers[_stakeOfferId].active == false) {
            revert StakeOfferNotActive(_stakeOfferId);
        }
        if (stakeOffers[_stakeOfferId].onlyAdmin == true) {
            revert StakeOfferNotAccessible(_stakeOfferId);
        }
        if (_amount == 0) {
            revert InvalidAmount(_amount);
        }
        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 stakeId = lastStakeId + 1;
        stakes[stakeId] = Stake(_stakeOfferId, _amount, block.timestamp, msg.sender);
        stakeIdToStakeOffer[stakeId] = _stakeOfferId;
        holderToStakeIds[msg.sender].push(stakeId);
        lastStakeId = stakeId;

        uint256 rewardRate = stakeOffers[_stakeOfferId].rate;
        uint256 duration = stakeOffers[_stakeOfferId].lockupDuration;

        uint256 ray = _yearlyRateToRay(rewardRate);

        // Check for overflow before adding to totalStaked
        uint256 newTotalStaked = totalStaked + _amount;
        require(newTotalStaked >= totalStaked, "TokenStaking: totalStaked overflow");
        totalStaked = newTotalStaked;
        
        // Calculate interest and check for overflow
        uint256 interest = _accrueInterest(_amount, ray, duration) - _amount;
        uint256 newTotalInterest = totalInterest + interest;
        require(newTotalInterest >= totalInterest, "TokenStaking: totalInterest overflow");
        totalInterest = newTotalInterest;
        
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
        if (_amount == 0) {
            revert InvalidAmount(_amount);
        }
        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 stakeId = lastStakeId + 1;
        stakes[stakeId] = Stake(_stakeOfferId, _amount, block.timestamp, _beneficiary);
        stakeIdToStakeOffer[stakeId] = _stakeOfferId;
        holderToStakeIds[_beneficiary].push(stakeId);
        lastStakeId = stakeId;

        uint256 rewardRate = stakeOffers[_stakeOfferId].rate;
        uint256 duration = stakeOffers[_stakeOfferId].lockupDuration;

        uint256 ray = _yearlyRateToRay(rewardRate);

        // Check for overflow before adding to totalStaked
        uint256 newTotalStaked = totalStaked + _amount;
        require(newTotalStaked >= totalStaked, "TokenStaking: totalStaked overflow");
        totalStaked = newTotalStaked;
        
        // Calculate interest and check for overflow
        uint256 interest = _accrueInterest(_amount, ray, duration) - _amount;
        uint256 newTotalInterest = totalInterest + interest;
        require(newTotalInterest >= totalInterest, "TokenStaking: totalInterest overflow");
        totalInterest = newTotalInterest;
        
        emit Deposit(_beneficiary, _amount, stakeId);
    }

    /**
     * @dev unStake checks eligibility and takes the pre-determined fee into considerations
     * 50% of unstake fee goes back to the staking contract
     * 50% of unstake fee is burned according to whitepaper
     * Handles discontinued stake offers properly by using the stored offer terms
     */
    function unStakeFixedTerm(uint256 _stakeId) external nonReentrant {
        Stake storage stake = stakes[_stakeId];
        uint256 stakeOfferId = stakeIdToStakeOffer[_stakeId];
        
        if (stake.owner != msg.sender) {
            revert InvalidOwner(_stakeId, msg.sender);
        }
        if (stake.principle <= 0) {
            revert StakeBalanceIsZero(_stakeId);
        }
        
        // Compare against the original lockup duration, regardless of
        // whether the stake offer was discontinued
        if ((block.timestamp - stake.created) <= stakeOffers[stakeOfferId].lockupDuration) {
            revert StakeIsLocked(_stakeId);
        }

        uint256 balance = _rewards(_stakeId);
        uint256 initialStake = stake.principle;

        uint256 afterFee;

        uint256 fee = stakeOffers[stakeIdToStakeOffer[_stakeId]].fee;
        uint256 diff = balance - initialStake;
        
        // Only apply fee if fee is greater than zero AND there's interest earned
        if (fee > 0 && diff > 0) {
            // Calculate fee amount correctly - fee is a percentage of interest (diff)
            uint256 feeAmount = (diff * fee) / 100;
            
            // Only apply fee if the amount is significant
            if (feeAmount > 0) {
                afterFee = balance - feeAmount;

                // Burn half of fee
                uint256 burnAmount = feeAmount / 2;
                if (burnAmount > 0) {
                    token.burn(burnAmount);
                }
            } else {
                // If fee amount rounds to zero, don't apply fee
                afterFee = balance;
            }
        } else {
            // No fee applied if fee is zero or no interest earned
            afterFee = balance;
        }

        // we only transfer amount afterFees and 50% of that remains inaccessible in staking pool
        require(token.balanceOf(address(this)) >= afterFee, 'TokenStaking: insufficient contract balance');
        token.safeTransfer(msg.sender, afterFee);
        stake.principle = 0; // Persisted b/c stake is defined as `Stake storage`

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
     * Properly handles discontinued stake offers by using the stored offer properties
     */
    function _rewards(uint256 _stakeId) internal view returns (uint256) {
        // make sure stake is only calculated against committed timestamp
        Stake memory stake = stakes[_stakeId];
        uint256 stakeOfferId = stakeIdToStakeOffer[_stakeId];
        
        // If principle is 0, this stake has been withdrawn or doesn't exist
        if (stake.principle == 0) {
            return 0;
        }

        uint256 principle = stake.principle;
        uint256 duration = stakeOffers[stakeOfferId].lockupDuration;
        uint256 stakeEndTime = stake.created + duration;
        uint256 rewardRate = stakeOffers[stakeOfferId].rate;

        // Even if the stake offer is discontinued, we honor the agreed rate and duration
        uint256 ray = _yearlyRateToRay(rewardRate);

        // Calculate interest based on current progress through the staking period
        if (stakeEndTime > block.timestamp) {
            return _accrueInterest(principle, ray, block.timestamp - stake.created);
        } else {
            return _accrueInterest(principle, ray, duration);
        }
    }

    /**
     * @dev Returns all stakeIds.
     * @return array of all stakeIds.
     */
    function getLastStakeId() external view onlyOwner returns (uint256) {
        return lastStakeId;
    }

    function getAllStakeIdsOfAddress(address _address, uint256 _start, uint256 _count) external view returns (uint256[] memory) {
        if (_address != msg.sender && msg.sender != owner()) {
            revert InvalidOwner(0, _address);
        }

        uint256[] memory stakeIds = holderToStakeIds[_address];
        uint256 length = stakeIds.length;

        require(_start < length, 'Start index out of bounds');

        if (_start == 0 && length < _count) {
            return stakeIds;
        }

        uint256 end = _start + _count;
        if (end > length) {
            end = length;
        }

        uint256[] memory paginatedIds = new uint256[](end - _start);
        for (uint256 i = _start; i < end; i++) {
            paginatedIds[i - _start] = stakeIds[i];
        }

        return paginatedIds;
    }

    /**
     * @dev Returns the current time.
     * @return the current timestamp in seconds.
     */
    function getCurrentTime() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    // Track total flexible rewards to avoid expensive iteration
    uint256 private totalFlexiblePrincipal;
    uint256 private reservedFlexibleRewards;
    
    /**
     * @dev Returns the amount of tokens that can be withdrawn by the owner.
     * This function uses tracking variables instead of iteration for better scalability.
     * @return the amount of tokens safely withdrawable by the owner
     */
    function getWithdrawableAmount() public view returns (uint256) {
        uint256 contractBalance = token.balanceOf(address(this));
        
        // Calculate total committed tokens (principal + accrued interest)
        // For fixed term stakes, we use totalStaked and totalInterest
        
        // For flexible stakes, we use a conservative estimate based on:
        // 1. Current total flexible principal
        // 2. Maximum potential growth based on time since last update
        // 3. Reserved rewards from previous calculations
        
        // Calculate maximum potential growth factor since last index update
        uint256 maxGrowthFactor = 0;
        if (block.timestamp > lastIndexUpdateTimestamp && flexibleRewardRate > 0) {
            uint256 timeDelta = block.timestamp - lastIndexUpdateTimestamp;
            // Calculate maximum growth using current rate
            uint256 currentIndex = rmul(rewardIndex, rpow(flexibleRewardRate, timeDelta));
            maxGrowthFactor = rdiv(currentIndex, rewardIndex);
        } else {
            // No growth if no time has passed or rate is 0
            maxGrowthFactor = wadToRay(1 ether); // RAY value for 1.0
        }
        
        // Calculate conservative estimate of flexible rewards
        // This overestimates rewards to ensure safety
        uint256 totalFlexibleRewards = 0;
        if (totalFlexiblePrincipal > 0) {
            // Estimate maximum potential rewards by applying growth factor to all principal
            uint256 maxPotentialValue = rmul(totalFlexiblePrincipal, maxGrowthFactor);
            totalFlexibleRewards = maxPotentialValue > totalFlexiblePrincipal 
                ? (maxPotentialValue - totalFlexiblePrincipal) + reservedFlexibleRewards 
                : reservedFlexibleRewards;
        } else {
            totalFlexibleRewards = reservedFlexibleRewards;
        }
        
        // Calculate total committed tokens
        uint256 totalCommitted = totalStaked + totalInterest + totalFlexibleRewards;
        
        // Return withdrawable amount, ensuring it doesn't go negative
        if (contractBalance > totalCommitted) {
            return contractBalance - totalCommitted;
        } else {
            return 0;
        }
    }

    // flexible staking logic with time-weighted accumulator system
    /**
     * @dev Get current rewards for a user without modifying state
     * Calculates using the current rewardIndex and the user's snapshot
     */
    function rewardsFlexible(address _user) external view returns (uint256) {
        // Get the current index value (if it needs updating)
        uint256 currentIndex = rewardIndex;
        if (block.timestamp > lastIndexUpdateTimestamp && flexibleRewardRate > 0) {
            uint256 timeDelta = block.timestamp - lastIndexUpdateTimestamp;
            currentIndex = rmul(rewardIndex, rpow(flexibleRewardRate, timeDelta));
        }

        // If user has no balance or no index yet, return 0
        if (flexibleBalanceOf[_user] == 0 || userRewardIndex[_user] == 0) {
            return 0;
        }

        // Calculate new rewards based on index ratio
        uint256 newRewards = rmul(flexibleBalanceOf[_user], rdiv(currentIndex, userRewardIndex[_user])) - flexibleBalanceOf[_user];

        // Add any previously unclaimed rewards
        return userUnclaimedRewards[_user] + newRewards;
    }

    /**
     * @dev Stake tokens in the flexible staking system
     */
    function stakeFlexible(uint256 _amount) external whenNotPaused nonReentrant {
        require(_amount > 0, 'Cannot stake zero amount');

        // Keep track of all flexible stakers
        if (flexibleStakerIndexes[msg.sender] == 0) {
            flexibleStakers.push(msg.sender);
            flexibleStakerIndexes[msg.sender] = flexibleStakers.length;
        }

        // Update user's rewards first (if they already have a stake)
        updateUserRewards(msg.sender);

        // Transfer tokens from user
        token.safeTransferFrom(msg.sender, address(this), _amount);

        // Update user's balance with overflow check
        uint256 newUserBalance = flexibleBalanceOf[msg.sender] + _amount;
        require(newUserBalance >= flexibleBalanceOf[msg.sender], "TokenStaking: user balance overflow");
        flexibleBalanceOf[msg.sender] = newUserBalance;

        // If this is user's first stake, set their index snapshot
        if (userRewardIndex[msg.sender] == 0) {
            userRewardIndex[msg.sender] = rewardIndex;
        }

        // Update total staked amount with overflow check
        uint256 newTotalStaked = totalStaked + _amount;
        require(newTotalStaked >= totalStaked, "TokenStaking: totalStaked overflow");
        totalStaked = newTotalStaked;
        
        // Update flexible principal tracking
        totalFlexiblePrincipal += _amount;

        emit DepositFlexible(msg.sender, _amount);
    }

    function getFlexibleStakers(uint256 _start, uint256 _count) external view onlyOwner returns (address[] memory) {
        address[] memory stakers = flexibleStakers;
        uint256 length = stakers.length;

        require(_start < length, 'Start index out of bounds');

        if (_start == 0 && length < _count) {
            return stakers;
        }

        uint256 end = _start + _count;
        if (end > length) {
            end = length;
        }

        address[] memory paginatedAddresses = new address[](end - _start);
        for (uint256 i = _start; i < end; i++) {
            paginatedAddresses[i - _start] = stakers[i];
        }

        return paginatedAddresses;
    }

    /**
     * @dev Compound rewards into principal for a user
     * Can be called by anyone to enable automation
     */
    function compoundFlexible(address _beneficiary) external nonReentrant {
        // First update the user's rewards
        updateUserRewards(_beneficiary);

        uint256 unclaimedRewards = userUnclaimedRewards[_beneficiary];
        if (unclaimedRewards > 0) {
            uint256 afterFee;

            // Apply fee if applicable
            if (flexibleFee > 0 && unclaimedRewards > 0) {
                uint256 feeAmount = (unclaimedRewards * flexibleFee) / 100;
                
                // Only apply fee if the amount is significant
                if (feeAmount > 0) {
                    uint256 burnAmount = feeAmount / 2;

                    // Burn half the fee
                    if (burnAmount > 0) {
                        token.burn(burnAmount);
                    }

                    afterFee = unclaimedRewards - feeAmount;
                } else {
                    // If fee amount rounds to zero, don't apply fee
                    afterFee = unclaimedRewards;
                }
            } else {
                // No fee applied if fee is zero or no rewards earned
                afterFee = unclaimedRewards;
            }

            // Add rewards to principal
            flexibleBalanceOf[_beneficiary] += afterFee;

            // Reset unclaimed rewards
            userUnclaimedRewards[_beneficiary] = 0;

            // Update total staked amount
            totalStaked += afterFee;
            
            // Update flexible principal tracking
            totalFlexiblePrincipal += afterFee;
            
            // Since we're converting rewards to principal, we can reduce the reserved rewards
            if (afterFee <= reservedFlexibleRewards) {
                reservedFlexibleRewards -= afterFee;
            } else {
                reservedFlexibleRewards = 0;
            }

            emit CompoundFlexible(_beneficiary, afterFee);
        }
    }

    /**
     * @dev Withdraw all tokens from flexible staking
     */
    function withdrawFlexible() external nonReentrant {
        if (flexibleBalanceOf[msg.sender] <= 0) {
            revert FlexibleStakeBalanceIsZero(msg.sender);
        }

        // Update the user's rewards first
        updateUserRewards(msg.sender);

        uint256 principal = flexibleBalanceOf[msg.sender];
        uint256 unclaimedRewards = userUnclaimedRewards[msg.sender];
        uint256 afterFee;

        // Apply fee to rewards if applicable
        if (unclaimedRewards > 0 && flexibleFee > 0) {
            uint256 feeAmount = (unclaimedRewards * flexibleFee) / 100;
            
            // Only apply fee if the amount is significant
            if (feeAmount > 0) {
                uint256 burnAmount = feeAmount / 2;

                // Burn half the fee
                if (burnAmount > 0) {
                    token.burn(burnAmount);
                }

                afterFee = unclaimedRewards - feeAmount;
            } else {
                // If fee amount rounds to zero, don't apply fee
                afterFee = unclaimedRewards;
            }
        } else {
            // No fee applied if fee is zero or no rewards earned
            afterFee = unclaimedRewards;
        }

        uint256 totalAmount = principal + afterFee;

        // Reset user state
        flexibleBalanceOf[msg.sender] = 0;
        userUnclaimedRewards[msg.sender] = 0;

        // Remove user from flexibleStakers array if they exist
        uint256 stakerIndex = flexibleStakerIndexes[msg.sender];
        if (stakerIndex > 0) {
            // Arrays are 1-indexed in our mapping for easier existence check
            uint256 actualIndex = stakerIndex - 1;
            uint256 lastIndex = flexibleStakers.length - 1;
            
            // If user isn't the last element, swap with the last element
            if (actualIndex != lastIndex) {
                address lastStaker = flexibleStakers[lastIndex];
                flexibleStakers[actualIndex] = lastStaker;
                // Update the index for the swapped element
                flexibleStakerIndexes[lastStaker] = stakerIndex;
            }
            
            // Remove the last element
            flexibleStakers.pop();
            // Reset the index for the removed user
            flexibleStakerIndexes[msg.sender] = 0;
        }

        // Update total staked amount
        totalStaked -= principal;
        
        // Update flexible principal tracking
        totalFlexiblePrincipal -= principal;
        
        // Add any unclaimed rewards to the reserved amount
        // This ensures rewards are still accounted for even after users withdraw
        if (afterFee > 0) {
            reservedFlexibleRewards += afterFee;
        }

        // Check contract balance before transfer
        require(token.balanceOf(address(this)) >= totalAmount, 'TokenStaking: insufficient contract balance');
        
        // Transfer tokens to user
        token.safeTransfer(msg.sender, totalAmount);

        emit WithdrawFlexible(msg.sender, totalAmount);
    }
}
