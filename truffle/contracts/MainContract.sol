// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MainContract 
{
    address public dean;

    mapping(address => bool) public isProfessor;
    mapping(address => bool) public isAssociateDean;
    mapping(uint => Marksheet) public marksheets;
    uint[] public studentList;

    enum RequestStatus { None, Pending, Processed, Authorized, Rejected }

    struct VerificationRequest 
    {
        address verifier;
        string companyName;
        uint studentId;
        RequestStatus status;
    }

    VerificationRequest[] public allRequests;
    mapping(address => mapping(uint => bool)) public canVerify; // verifierAddress => studentId => isAllowed

    struct Marksheet 
    {
        uint studentId;
        address studentWallet;
        uint marks;
        address professorAddress;
        bool isValidated;
        address validatedBy;
        uint timestamp;
        bytes32 fileHash;
        bool isUploaded;
        address uploadedBy;
    }

    modifier onlyDean() 
    {
        require(msg.sender == dean, "Caller is not the Dean");
        _;
    }

    modifier onlyProfessor() 
    {
        require(isProfessor[msg.sender], "Caller is not a Professor");
        _;
    }

    modifier onlyAssociateDean() 
    {
        require(isAssociateDean[msg.sender], "Caller is not an Associate Dean");
        _;
    }

    modifier onlyAuthorizedViewer(uint _studentId) 
    {
        require(
            msg.sender == dean || 
            isProfessor[msg.sender] || 
            isAssociateDean[msg.sender] || 
            msg.sender == marksheets[_studentId].studentWallet ||
            canVerify[msg.sender][_studentId],
            "Caller is not authorized to view this marksheet"
        );
        _;
    }

    constructor() 
    {
        dean = msg.sender;
    }

    function addProfessor(address _professor) external onlyDean 
    {
        require(_professor != address(0), "Invalid address");
        require(!isProfessor[_professor], "Already a professor");
        isProfessor[_professor] = true;
    }

    function removeProfessor(address _professor) external onlyDean 
    {
        require(_professor != address(0), "Invalid address");
        require(isProfessor[_professor], "Not a professor");
        isProfessor[_professor] = false;
    }

    function addAssociateDean(address _associateDean) external onlyDean 
    {
        require(_associateDean != address(0), "Invalid address");
        require(!isAssociateDean[_associateDean], "Already an Associate Dean");
        isAssociateDean[_associateDean] = true;
    }

    function removeAssociateDean(address _associateDean) external onlyDean 
    {
        require(_associateDean != address(0), "Invalid address");
        require(isAssociateDean[_associateDean], "Not an Associate Dean");
        isAssociateDean[_associateDean] = false;
    }

    function studentListLength() external view returns (uint) 
    {
        return studentList.length;
    }

    function registerStudents(uint[] calldata _studentIds, address[] calldata _studentWallets) external onlyDean 
    {
        require(_studentIds.length == _studentWallets.length, "Mismatched array lengths");

        for (uint i = 0; i < _studentIds.length; i++) 
        {
            uint id = _studentIds[i];
            address wallet = _studentWallets[i];

            require(id != 0, "Invalid student ID");
            require(wallet != address(0), "Invalid student wallet address");
            require(marksheets[id].studentId == 0, "Student already registered");

            marksheets[id].studentId = id;
            marksheets[id].studentWallet = wallet;

            studentList.push(id);
        }
    }

    function upload(uint _studentId, uint _marks) external onlyProfessor 
    {
        Marksheet storage marksheet = marksheets[_studentId];

        require(marksheet.studentId != 0, "Student not registered");
        require(marksheet.professorAddress == address(0), "Marks already uploaded");

        marksheet.marks = _marks;
        marksheet.professorAddress = msg.sender;
    }

    function validate(uint _studentId, uint _nonce) external onlyAssociateDean 
    {
        Marksheet storage marksheet = marksheets[_studentId];
        require(marksheet.professorAddress != address(0), "Marksheet does not exist");
        require(!marksheet.isValidated, "Marksheet already validated");

        bytes32 verificationHash = keccak256(abi.encodePacked(_nonce, marksheet.studentId, marksheet.marks, marksheet.professorAddress));

        // Check PoW: first byte of the hash must be 0.
        require(verificationHash[0] == 0, "Proof of Work is invalid: first byte is not zero");

        marksheet.isValidated = true;
        marksheet.validatedBy = msg.sender;
        marksheet.timestamp = block.timestamp;

        // Calculate and store the final fileHash of the validated data.
        marksheet.fileHash = keccak256(abi.encodePacked(
            marksheet.studentId,
            marksheet.marks,
            marksheet.professorAddress,
            marksheet.isValidated,
            marksheet.validatedBy,
            marksheet.timestamp
        ));
    }

    function finalUpload(uint _studentId) external onlyDean 
    {
        Marksheet storage marksheet = marksheets[_studentId];
        require(marksheet.isValidated, "Marksheet has not been validated by an Associate Dean yet");
        require(!marksheet.isUploaded, "Marksheet has already been finalized");

        marksheet.isUploaded = true;
        marksheet.uploadedBy = dean;
    }

    // Verifier asks for permission
    function requestVerification(uint _studentId, string calldata _companyName) external
    {
        require(bytes(_companyName).length > 0, "Company name is required");
        require(marksheets[_studentId].studentId != 0, "Student does not exist");
        require(marksheets[_studentId].isUploaded, "Marksheet is not finalized yet");
        require(!canVerify[msg.sender][_studentId], "You already have access to this record");

        allRequests.push(VerificationRequest({
            verifier: msg.sender,
            companyName: _companyName,
            studentId: _studentId,
            status: RequestStatus.Pending
        }));
    }

    // Associate Dean processes the request
    function processRequest(uint _reqIdx) external onlyAssociateDean 
    {
        require(_reqIdx < allRequests.length, "Invalid request index");
        VerificationRequest storage req = allRequests[_reqIdx];
        require(req.status == RequestStatus.Pending, "Request is not pending");

        req.status = RequestStatus.Processed;
    }

    // Dean finalizes and unlocks the record
    function authorizeRequest(uint _reqIdx) external onlyDean 
    {
        require(_reqIdx < allRequests.length, "Invalid request index");
        VerificationRequest storage req = allRequests[_reqIdx];
        require(req.status == RequestStatus.Processed, "Request not processed by Assoc. Dean");

        req.status = RequestStatus.Authorized;
        canVerify[req.verifier][req.studentId] = true;
    }

    // Function to reject invalid requests
    function rejectRequest(uint _reqIdx) external 
    {
        require(msg.sender == dean || isAssociateDean[msg.sender], "Not authorized to reject");
        require(_reqIdx < allRequests.length, "Invalid request index");
        VerificationRequest storage req = allRequests[_reqIdx];
        require(req.status == RequestStatus.Pending || req.status == RequestStatus.Processed, "Cannot reject this status");

        req.status = RequestStatus.Rejected;
    }

    // Count of total verification requests
    function getRequestsCount() external view returns (uint) 
    {
        return allRequests.length;
    }

    // --- Restricted Viewing & Verifying ---

    function viewMarksheet(uint _studentId) external view onlyAuthorizedViewer(_studentId) returns (Marksheet memory)
    {
        return marksheets[_studentId];
    }
}