// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// cSpell:ignore reentrancy, ierc, keccak, moga

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './IMogaVesting.sol';

/**
 * @title MogaVesting
 * @dev This contract implements a vesting schedule for ERC20 tokens.
 * It allows the owner to create vesting schedules for beneficiaries, release vested tokens,
 * and revoke vesting schedules if they are revocable.
 * @author
 * @notice This contract is designed to be used with ERC20 tokens and should be deployed on EVM-compatible blockchains.
 * The contract uses OpenZeppelin's SafeERC20 library for safe token transfers and Ownable for access control.
 * The contract is designed to be used in a vesting scenario where the owner can create vesting schedules for beneficiaries,
 * and beneficiaries can release their vested tokens after the cliff period.
 * The vesting schedules are identified by a unique identifier, which is computed based on the beneficiary address and an index.
 */
contract MogaVesting is Ownable, ReentrancyGuard, IMogaVesting {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    struct VestingSchedule {
        address beneficiary; // beneficiary of tokens after they are released
        uint256 cliff; // cliff time of the vesting start in seconds since the UNIX epoch
        uint256 start; // start time of the vesting period in seconds since the UNIX epoch
        uint256 duration; // duration of the vesting period in seconds
        uint256 slicePeriodSeconds; // duration of a slice period for the vesting in seconds
        bool revocable; // whether or not the vesting is revocable
        uint256 amountTotal; // total amount of tokens to be released at the end of the vesting
        uint256 released; // amount of tokens released
        bool revoked; // whether or not the vesting has been revoked
    }

    bytes32[] private vestingSchedulesIds;
    mapping(bytes32 => VestingSchedule) private vestingSchedules;
    uint256 private vestingSchedulesTotalAmount;
    mapping(address => uint256) private holdersVestingCount;

    error InvalidOwner(address queried, address actual);

    /**
     * @dev Reverts if the vesting schedule does not exist or has been revoked.
     */
    modifier onlyIfVestingScheduleNotRevoked(bytes32 vestingScheduleId) {
        require(!vestingSchedules[vestingScheduleId].revoked);
        _;
    }

    /**
     * @dev Creates a vesting contract.
     * @param token_ address of the ERC20 token contract
     */
    constructor(address initialOwner, address token_) Ownable(initialOwner) {
        token = IERC20(token_);
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
     * @notice Creates a new vesting schedule for a beneficiary.
     * @param _beneficiary address of the beneficiary to whom vested tokens are transferred
     * @param _start start time of the vesting period
     * @param _cliff duration in seconds of the cliff in which tokens will begin to vest
     * @param _duration duration in seconds of the period in which the tokens will vest
     * @param _slicePeriodSeconds duration of a slice period for the vesting in seconds
     * @param _revocable whether the vesting is revocable or not
     * @param _amount total amount of tokens to be released at the end of the vesting
     */
    function createVestingSchedule(
        address _beneficiary,
        uint256 _start,
        uint256 _cliff,
        uint256 _duration,
        uint256 _slicePeriodSeconds,
        bool _revocable,
        uint256 _amount
    ) external onlyOwner {
        require(getWithdrawableAmount() >= _amount, 'TokenVesting: cannot create vesting schedule because not sufficient tokens');
        require(_duration > 0, 'TokenVesting: duration must be > 0');
        require(_amount > 0, 'TokenVesting: amount must be > 0');
        require(_slicePeriodSeconds >= 1, 'TokenVesting: slicePeriodSeconds must be >= 1');
        require(_duration >= _cliff, 'TokenVesting: duration must be >= cliff');
        bytes32 vestingScheduleId = computeNextVestingScheduleIdForBeneficiary(_beneficiary);
        uint256 cliff = _start + _cliff;
        vestingSchedules[vestingScheduleId] = VestingSchedule(
            _beneficiary,
            cliff,
            _start,
            _duration,
            _slicePeriodSeconds,
            _revocable,
            _amount,
            0,
            false
        );
        vestingSchedulesTotalAmount = vestingSchedulesTotalAmount + _amount;
        vestingSchedulesIds.push(vestingScheduleId);
        uint256 currentVestingCount = holdersVestingCount[_beneficiary];
        holdersVestingCount[_beneficiary] = currentVestingCount + 1;
    }

    /**
     * @notice Revokes the vesting schedule for given identifier.
     * @param vestingScheduleId the vesting schedule identifier
     */
    function revoke(bytes32 vestingScheduleId) external onlyOwner onlyIfVestingScheduleNotRevoked(vestingScheduleId) {
        VestingSchedule storage vestingSchedule = vestingSchedules[vestingScheduleId];
        require(vestingSchedule.revocable, 'TokenVesting: vesting is not revocable');
        uint256 vestedAmount = _computeReleasableAmount(vestingSchedule);
        if (vestedAmount > 0) {
            release(vestingScheduleId, vestedAmount);
        }
        uint256 unreleased = vestingSchedule.amountTotal - vestingSchedule.released;
        vestingSchedulesTotalAmount = vestingSchedulesTotalAmount - unreleased;
        vestingSchedule.revoked = true;
    }

    /**
     * @notice Withdraw the specified amount if possible.
     * @param amount the amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant onlyOwner {
        require(getWithdrawableAmount() >= amount, 'TokenVesting: not enough withdrawable funds');
        token.safeTransfer(msg.sender, amount);
    }

    /**
     * @notice Release vested amount of tokens.
     * @param vestingScheduleId the vesting schedule identifier
     * @param amount the amount to release
     */
    function release(bytes32 vestingScheduleId, uint256 amount) public nonReentrant onlyIfVestingScheduleNotRevoked(vestingScheduleId) {
        VestingSchedule storage vestingSchedule = vestingSchedules[vestingScheduleId];
        bool isBeneficiary = msg.sender == vestingSchedule.beneficiary;

        bool isReleaser = (msg.sender == owner());
        require(isBeneficiary || isReleaser, 'TokenVesting: only beneficiary and owner can release vested tokens');
        uint256 vestedAmount = _computeReleasableAmount(vestingSchedule);
        require(vestedAmount >= amount, 'TokenVesting: cannot release tokens, not enough vested tokens');
        vestingSchedule.released = vestingSchedule.released + amount;
        address payable beneficiaryPayable = payable(vestingSchedule.beneficiary);
        vestingSchedulesTotalAmount = vestingSchedulesTotalAmount - amount;
        token.safeTransfer(beneficiaryPayable, amount);
    }

    /**
     * @dev Returns the number of vesting schedules associated to a beneficiary.
     * @return the number of vesting schedules
     */
    function getVestingSchedulesCountByBeneficiary(address _beneficiary) external view returns (uint256) {
        if (_beneficiary != msg.sender && msg.sender != owner()) {
            // revert InvalidOwner(_beneficiary, msg.sender);
            return 0;
        }
        return holdersVestingCount[_beneficiary];
    }

    /**
     * @dev Returns the vesting schedule id at the given index.
     * @return the vesting id
     */
    function getVestingIdAtIndex(uint256 index) external view onlyOwner returns (bytes32) {
        require(index < getVestingSchedulesCount(), 'TokenVesting: index out of bounds');
        return vestingSchedulesIds[index];
    }

    /**
     * @notice Returns the vesting schedule information for a given holder and index.
     * @return beneficiary The address of the beneficiary
     * @return cliff The cliff time of the vesting schedule
     * @return start The start time of the vesting schedule
     * @return duration The duration of the vesting schedule
     * @return slicePeriodSeconds The slice period in seconds
     * @return revocable Whether the vesting is revocable
     * @return amountTotal The total amount of tokens to be vested
     * @return released The amount of tokens already released
     * @return revoked Whether the vesting schedule has been revoked
     *
     * Note: Solidity compiler if a VestingSchedule is returned, even if it is ABI-compatible with the tuple.
     */
    function getVestingScheduleForBeneficiaryAndIndex(
        address holder,
        uint256 index
    )
        external
        view
        returns (
            address beneficiary,
            uint256 cliff,
            uint256 start,
            uint256 duration,
            uint256 slicePeriodSeconds,
            bool revocable,
            uint256 amountTotal,
            uint256 released,
            bool revoked
        )
    {
        if (holder != msg.sender && msg.sender != owner()) {
            // revert InvalidOwner(holder, msg.sender);
            return (address(0), 0, 0, 0, 0, false, 0, 0, false);
        }
        return getVestingSchedule(computeVestingScheduleIdForBeneficiaryAndIndex(holder, index));
    }

    /**
     * @dev Returns the last vesting schedule for a given holder address.
     * @return beneficiary The address of the beneficiary
     * @return cliff The cliff time of the vesting schedule
     * @return start The start time of the vesting schedule
     * @return duration The duration of the vesting schedule
     * @return slicePeriodSeconds The slice period in seconds
     * @return revocable Whether the vesting is revocable
     * @return amountTotal The total amount of tokens to be vested
     * @return released The amount of tokens already released
     * @return revoked Whether the vesting schedule has been revoked
     *
     * Note: Solidity compiler if a VestingSchedule is returned, even if it is ABI-compatible with the tuple.
     */
    function getLastVestingScheduleForBeneficiary(
        address holder
    )
        external
        view
        returns (
            address beneficiary,
            uint256 cliff,
            uint256 start,
            uint256 duration,
            uint256 slicePeriodSeconds,
            bool revocable,
            uint256 amountTotal,
            uint256 released,
            bool revoked
        )
    {
        if (holder != msg.sender && msg.sender != owner()) {
            // revert InvalidOwner(holder, msg.sender);
            return (address(0), 0, 0, 0, 0, false, 0, 0, false);
        }
        return getVestingSchedule(computeVestingScheduleIdForBeneficiaryAndIndex(holder, holdersVestingCount[holder] - 1));
    }

    /**
     * @notice Returns the total amount of vesting schedules.
     * @return the total amount of vesting schedules
     */
    function getVestingSchedulesTotalAmount() external view returns (uint256) {
        return vestingSchedulesTotalAmount;
    }

    /**
     * @dev Returns the address of the ERC20 token managed by the vesting contract.
     */
    function getToken() external view returns (address) {
        return address(token);
    }

    /**
     * @dev Returns the number of vesting schedules managed by this contract.
     * @return the number of vesting schedules
     */
    function getVestingSchedulesCount() public view returns (uint256) {
        return vestingSchedulesIds.length;
    }

    /**
     * @notice Computes the vested amount of tokens for the given vesting schedule identifier.
     * @return the vested amount
     */
    function computeReleasableAmount(
        bytes32 vestingScheduleId
    ) external view onlyIfVestingScheduleNotRevoked(vestingScheduleId) returns (uint256) {
        VestingSchedule storage vestingSchedule = vestingSchedules[vestingScheduleId];
        return _computeReleasableAmount(vestingSchedule);
    }

    /**
     * @notice Returns the vesting schedule information for a given identifier.
     * @return beneficiary The address of the beneficiary
     * @return cliff The cliff time of the vesting schedule
     * @return start The start time of the vesting schedule
     * @return duration The duration of the vesting schedule
     * @return slicePeriodSeconds The slice period in seconds
     * @return revocable Whether the vesting is revocable
     * @return amountTotal The total amount of tokens to be vested
     * @return released The amount of tokens already released
     * @return revoked Whether the vesting schedule has been revoked
     *
     * Note: Solidity compiler if a VestingSchedule is returned, even if it is ABI-compatible with the tuple.
     */
    function getVestingSchedule(
        bytes32 vestingScheduleId
    )
        public
        view
        returns (
            address beneficiary,
            uint256 cliff,
            uint256 start,
            uint256 duration,
            uint256 slicePeriodSeconds,
            bool revocable,
            uint256 amountTotal,
            uint256 released,
            bool revoked
        )
    {
        VestingSchedule memory vs = vestingSchedules[vestingScheduleId];
        return (
            vs.beneficiary,
            vs.cliff,
            vs.start,
            vs.duration,
            vs.slicePeriodSeconds,
            vs.revocable,
            vs.amountTotal,
            vs.released,
            vs.revoked
        );
    }

    /**
     * @dev Returns the amount of tokens that can be withdrawn by the owner.
     * @return the amount of tokens
     */
    function getWithdrawableAmount() public view returns (uint256) {
        return token.balanceOf(address(this)) - vestingSchedulesTotalAmount;
    }

    /**
     * @dev Computes the next vesting schedule identifier for a given holder address.
     */
    function computeNextVestingScheduleIdForBeneficiary(address holder) public view returns (bytes32) {
        if (holder != msg.sender && msg.sender != owner()) {
            // revert InvalidOwner(holder, msg.sender);
            return bytes32(0);
        }
        return computeVestingScheduleIdForBeneficiaryAndIndex(holder, holdersVestingCount[holder]);
    }

    /**
     * @dev Computes the vesting schedule identifier for an address and an index.
     */
    function computeVestingScheduleIdForBeneficiaryAndIndex(address holder, uint256 index) public view returns (bytes32) {
        if (holder != msg.sender && msg.sender != owner()) {
            // revert InvalidOwner(holder, msg.sender);
            return bytes32(0);
        }
        return keccak256(abi.encodePacked(holder, index));
    }

    /**
     * @dev Computes the releasable amount of tokens for a vesting schedule.
     * @return the amount of releasable tokens
     */
    function _computeReleasableAmount(VestingSchedule memory vestingSchedule) internal view returns (uint256) {
        // Retrieve the current time.
        uint256 currentTime = getCurrentTime();
        // If the current time is before the cliff, no tokens are releasable.
        if ((currentTime < vestingSchedule.cliff) || vestingSchedule.revoked) {
            return 0;
        }
        // If the current time is after the vesting period, all tokens are releasable,
        // minus the amount already released.
        else if (currentTime >= vestingSchedule.start + vestingSchedule.duration) {
            return vestingSchedule.amountTotal - vestingSchedule.released;
        }
        // Otherwise, some tokens are releasable.
        else {
            // Compute the number of full vesting periods that have elapsed.
            uint256 timeFromStart = currentTime - vestingSchedule.start;
            uint256 secondsPerSlice = vestingSchedule.slicePeriodSeconds;
            uint256 vestedSlicePeriods = timeFromStart / secondsPerSlice;
            uint256 vestedSeconds = vestedSlicePeriods * secondsPerSlice;
            // Compute the amount of tokens that are vested.
            uint256 vestedAmount = (vestingSchedule.amountTotal * vestedSeconds) / vestingSchedule.duration;
            // Subtract the amount already released and return.
            return vestedAmount - vestingSchedule.released;
        }
    }

    /**
     * @dev Returns the current time.
     * @return the current timestamp in seconds.
     */
    function getCurrentTime() internal view virtual returns (uint256) {
        return block.timestamp;
    }
}
