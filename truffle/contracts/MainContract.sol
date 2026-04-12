// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MainContract 
{

    address public dean;

    mapping(address => bool) public isProfessor;
    mapping(address => bool) public isAssociateDean;
    mapping(uint => Marksheet) public marksheets;
    uint[] public studentList;

    struct Marksheet 
    {
        uint studentId;
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

    function upload(uint _studentId, uint _marks) external onlyProfessor 
    {
        require(marksheets[_studentId].professorAddress == address(0), "Marksheet already initiated for this student");

        marksheets[_studentId].studentId = _studentId;
        marksheets[_studentId].marks = _marks;
        marksheets[_studentId].professorAddress = msg.sender;

        studentList.push(_studentId);
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

    function viewMarksheet(uint _studentId) external view returns (Marksheet memory) 
    {
        return marksheets[_studentId];
    }

    function verify(
        uint _studentId,
        uint _marks,
        address _professorAddress,
        bool _isValidated,
        address _validatedBy,
        uint _timestamp
    ) external view returns (bool)
    {
        Marksheet storage originalMarksheet = marksheets[_studentId];

        if (originalMarksheet.fileHash == bytes32(0))
        {
            return false;
        }

        bytes32 verificationHash = keccak256(abi.encodePacked(
            _studentId,
            _marks,
            _professorAddress,
            _isValidated,
            _validatedBy,
            _timestamp
        ));

        return (verificationHash == originalMarksheet.fileHash);
    }
}
