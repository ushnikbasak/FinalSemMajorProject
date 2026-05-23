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

    // The Subject Catalog: Maps a Subject ID string to true/false (Valid/Invalid)
    mapping(string => bool) public isValidSubject;

    // Tracks which professor is allowed to grade which subject
    mapping(address => mapping(string => bool)) public professorPermissions;

    struct SubjectResult 
    {
        string subjectId;
        uint marks; // Stored as marks + 1 (0 = not graded by professor yet)
        address professor;
    }

    struct Marksheet 
    {
        uint studentId;
        address studentWallet;
        SubjectResult[] results; // Dynamic array: handles 1 or multiple subjects
        bool isValidated;
        address validatedBy;
        uint timestamp;
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

    
    // Adds a new subject code (e.g., "CS801") to the official subject catalog
    function addSubjectToCatalog(string calldata _subjectId) external onlyDean 
    {
        require(bytes(_subjectId).length > 0, "Subject ID cannot be empty");
        require(!isValidSubject[_subjectId], "Subject already exists in catalog");
        
        isValidSubject[_subjectId] = true;
    }

    // Deactivates a subject in the catalog, preventing new student registrations
    function removeSubjectFromCatalog(string calldata _subjectId) external onlyDean 
    {
        require(isValidSubject[_subjectId], "Subject is not in the catalog");

        isValidSubject[_subjectId] = false;
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

    // Grants a registered professor the right to upload marks for a specific subject
    function assignSubjectToProfessor(address _professor, string calldata _subjectId) external onlyDean 
    {
        require(isProfessor[_professor], "Address is not a registered professor");
        require(isValidSubject[_subjectId], "Subject does not exist in the catalog");

        professorPermissions[_professor][_subjectId] = true;
    }

    // Revokes a professor's right to upload marks for a specific subject
    function revokeSubjectFromProfessor(address _professor, string calldata _subjectId) external onlyDean 
    {
        require(isProfessor[_professor], "Address is not a registered professor");
        require(isValidSubject[_subjectId], "Subject does not exist in the catalog");
        require(professorPermissions[_professor][_subjectId], "Professor is not assigned to this subject");

        professorPermissions[_professor][_subjectId] = false;
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

    function registerStudents(
        uint[] calldata _studentIds, 
        address[] calldata _studentWallets,
        string[][] calldata _studentSubjects // 2D array for variable subjects
    ) external onlyDean
    {
        require(_studentIds.length == _studentWallets.length, "Mismatched arrays: Wallets");
        require(_studentIds.length == _studentSubjects.length, "Mismatched arrays: Subjects");

        for (uint i = 0; i < _studentIds.length; i++) 
        {
            uint id = _studentIds[i];
            require(id != 0, "Invalid student ID");
            require(_studentWallets[i] != address(0), "Invalid student wallet");
            require(marksheets[id].studentId == 0, "Student already registered");

            marksheets[id].studentId = id;
            marksheets[id].studentWallet = _studentWallets[i];

            // Push an empty grading placeholder for each subject this student takes
            for (uint j = 0; j < _studentSubjects[i].length; j++)
            {
                // Ensure the subject exists in the catalog
                require(isValidSubject[_studentSubjects[i][j]], "Cannot register: Subject not in catalog");

                marksheets[id].results.push(SubjectResult({
                    subjectId: _studentSubjects[i][j],
                    marks: 0, // 0 = ungraded
                    professor: address(0)
                }));
            }

            studentList.push(id);
        }
    }

    function upload(uint _studentId, string calldata _subjectID, uint _marks) external onlyProfessor 
    {
        require(professorPermissions[msg.sender][_subjectID], "Not authorized for this subject");
        require(_marks <= 100, "Marks must be between 0 and 100");
        
        Marksheet storage marksheet = marksheets[_studentId];
        require(marksheet.studentId != 0, "Student not registered");

        bool subjectFound = false;
        
        // Search the student's dynamic array for the specific subject
        for (uint i = 0; i < marksheet.results.length; i++) 
        {
            if (keccak256(bytes(marksheet.results[i].subjectId)) == keccak256(bytes(_subjectID)))
            {
                require(marksheet.results[i].marks == 0, "This subject is already graded");
                
                marksheet.results[i].marks = _marks + 1; // Sentinel value offsetting
                marksheet.results[i].professor = msg.sender;
                
                subjectFound = true;
                break;
            }
        }

        require(subjectFound, "Student is not registered for this subject");
    }

    function validate(uint _studentId, uint _nonce) external onlyAssociateDean 
    {
        Marksheet storage marksheet = marksheets[_studentId];
        require(marksheet.studentId != 0, "Student not registered");
        require(!marksheet.isValidated, "Marksheet already validated");
        require(marksheet.results.length > 0, "Student has no registered subjects");

        // Loop through all subjects to ensure none are 0(ungraded)
        for (uint i = 0; i < marksheet.results.length; i++) 
        {
            require(marksheet.results[i].marks > 0, "Not all subjects have been graded yet");
        }

        // Check PoW: first byte of the hash must be 0
        bytes32 verificationHash = keccak256(abi.encodePacked(_nonce, marksheet.studentId, "Validation"));
        require(verificationHash[0] == 0, "Proof of Work is invalid: first byte is not zero");

        marksheet.isValidated = true;
        marksheet.validatedBy = msg.sender;
        marksheet.timestamp = block.timestamp;
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