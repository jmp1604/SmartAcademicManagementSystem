class XMLGenerator {
    static generateSubmissionXML(submission, file, fileHash) {
        const timestamp = new Date().toISOString();
        
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<submission>
    <metadata>
        <submission_id>${this.escapeXML(submission.id)}</submission_id>
        <professor_id>${this.escapeXML(submission.professor_id)}</professor_id>
        <requirement_id>${this.escapeXML(submission.requirement_id)}</requirement_id>
        <department_id>${this.escapeXML(submission.department_id)}</department_id>
        <semester_id>${this.escapeXML(submission.semester_id)}</semester_id>
        <status>pending</status>
        <submitted_at>${submission.submitted_at}</submitted_at>
        <created_at>${timestamp}</created_at>
    </metadata>
    <file_reference>
        <file_id>${this.escapeXML(file.id)}</file_id>
        <file_name>${this.escapeXML(file.file_name)}</file_name>
        <file_size>${file.file_size}</file_size>
        <file_type>${this.escapeXML(file.file_type)}</file_type>
        <file_hash algorithm="SHA256">${fileHash}</file_hash>
        <storage_path>${this.escapeXML(file.file_url)}</storage_path>
    </file_reference>
    <audit_trail>
        <staging_created_at>${timestamp}</staging_created_at>
        <staging_location>submission-staging</staging_location>
        <xml_validation>pending</xml_validation>
    </audit_trail>
</submission>`;

        return xmlContent;
    }
    static generateApprovalXML(submissionId, adminId, adminRemarks) {
        const timestamp = new Date().toISOString();
        
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<approval>
    <submission_id>${this.escapeXML(submissionId)}</submission_id>
    <admin_id>${this.escapeXML(adminId)}</admin_id>
    <action>approved</action>
    <approved_at>${timestamp}</approved_at>
    <remarks>${this.escapeXML(adminRemarks)}</remarks>
    <migration_status>
        <from_staging>true</from_staging>
        <to_permanent>pending</to_permanent>
    </migration_status>
</approval>`;

        return xmlContent;
    }
    static generateRejectionXML(submissionId, adminId, rejectionReason) {
        const timestamp = new Date().toISOString();
        
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<rejection>
    <submission_id>${this.escapeXML(submissionId)}</submission_id>
    <admin_id>${this.escapeXML(adminId)}</admin_id>
    <action>rejected</action>
    <rejected_at>${timestamp}</rejected_at>
    <reason>${this.escapeXML(rejectionReason)}</reason>
    <cleanup_status>
        <staging_file_removed>pending</staging_file_removed>
        <xml_archived>pending</xml_archived>
    </cleanup_status>
</rejection>`;

        return xmlContent;
    }
    static escapeXML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    static async calculateFileHash(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }
    static validateXML(xmlString) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
            
            if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
                console.error('XML Parse Error:', xmlDoc.getElementsByTagName('parsererror')[0]);
                return false;
            }
            return true;
        } catch (error) {
            console.error('XML Validation Error:', error);
            return false;
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = XMLGenerator;
}
