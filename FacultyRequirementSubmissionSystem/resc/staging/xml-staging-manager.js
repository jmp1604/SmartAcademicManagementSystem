/**
 * XML Staging Manager
 * Handles XML file storage and movement between staging/permanent buckets
 * Client-side Supabase Storage operations only
 */

class XMLStagingManager {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.stagingBucket = 'submission-staging';      // Staging bucket
        this.permanentBucket = 'faculty-submissions';   // Permanent bucket
    }

    /**
     * Store XML file in staging bucket when submission is pending
     * @param {string} submissionId - Submission ID
     * @param {string} xmlContent - XML content
     * @returns {Promise<{success: boolean, path: string, error?: string}>}
     */
    async storeXMLInStaging(submissionId, xmlContent) {
        try {
            const fileName = `${submissionId}/metadata.xml`;
            
            // Upload XML to staging bucket
            const { data, error } = await this.supabase.storage
                .from(this.stagingBucket)
                .upload(fileName, new Blob([xmlContent], { type: 'application/xml' }), {
                    cacheControl: '3600',
                    upsert: true
                });

            if (error) {
                console.error('Error uploading XML to staging:', error);
                return { success: false, error: error.message };
            }

            console.log(`✓ XML stored in staging: ${fileName}`);
            return { success: true, path: fileName };

        } catch (err) {
            console.error('Error in storeXMLInStaging:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Move XML from staging to permanent storage when approved
     * @param {string} submissionId - Submission ID
     * @param {string} adminId - Admin ID who approved
     * @returns {Promise<{success: boolean, path: string, error?: string}>}
     */
    async moveXMLToPermanent(submissionId, adminId) {
        try {
            const stagingPath = `${submissionId}/metadata.xml`;
            const permanentPath = `approved/${submissionId}/metadata.xml`;

            // Read from staging
            const { data: fileData, error: readError } = await this.supabase.storage
                .from(this.stagingBucket)
                .download(stagingPath);

            if (readError) {
                console.error('Error reading XML from staging:', readError);
                return { success: false, error: readError.message };
            }

            // Upload to permanent storage
            const { error: uploadError } = await this.supabase.storage
                .from(this.permanentBucket)
                .upload(permanentPath, fileData, {
                    cacheControl: '86400',
                    upsert: true
                });

            if (uploadError) {
                console.error('Error uploading XML to permanent:', uploadError);
                return { success: false, error: uploadError.message };
            }

            // Store approval record
            const approvalPath = `approved/${submissionId}/approval-record.xml`;
            const approvalXML = XMLGenerator.generateApprovalXML(submissionId, adminId, 'Approved');
            
            await this.supabase.storage
                .from(this.permanentBucket)
                .upload(approvalPath, new Blob([approvalXML], { type: 'application/xml' }), {
                    cacheControl: '86400',
                    upsert: true
                });

            // Delete from staging
            await this.supabase.storage
                .from(this.stagingBucket)
                .remove([stagingPath]);

            console.log(`✓ XML moved from staging to permanent: ${permanentPath}`);
            return { success: true, path: permanentPath };

        } catch (err) {
            console.error('Error in moveXMLToPermanent:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Clean up XML in staging when submission is rejected
     * @param {string} submissionId - Submission ID
     * @param {string} adminId - Admin ID who rejected
     * @param {string} rejectionReason - Reason for rejection
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async cleanupXMLOnRejection(submissionId, adminId, rejectionReason) {
        try {
            const stagingPath = `${submissionId}/metadata.xml`;

            // Store rejection record before cleanup
            const rejectionXML = XMLGenerator.generateRejectionXML(submissionId, adminId, rejectionReason);
            const rejectionPath = `rejected/${submissionId}/rejection-record.xml`;

            await this.supabase.storage
                .from(this.stagingBucket)
                .upload(rejectionPath, new Blob([rejectionXML], { type: 'application/xml' }), {
                    cacheControl: '3600',
                    upsert: true
                });

            // Delete XML from staging
            const { error: deleteError } = await this.supabase.storage
                .from(this.stagingBucket)
                .remove([stagingPath]);

            if (deleteError) {
                console.warn('Could not delete staging XML:', deleteError);
                // Don't fail on this - rejection record is already stored
            }

            console.log(`✓ XML cleaned up from staging, rejection record stored`);
            return { success: true };

        } catch (err) {
            console.error('Error in cleanupXMLOnRejection:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Retrieve XML metadata for a submission
     * @param {string} submissionId - Submission ID
     * @param {boolean} isPending - Whether to get from staging
     * @returns {Promise<{success: boolean, xml?: string, error?: string}>}
     */
    async retrieveXML(submissionId, isPending = true) {
        try {
            const bucket = isPending ? this.stagingBucket : this.permanentBucket;
            const path = isPending 
                ? `${submissionId}/metadata.xml`
                : `approved/${submissionId}/metadata.xml`;

            const { data, error } = await this.supabase.storage
                .from(bucket)
                .download(path);

            if (error) {
                console.error('Error retrieving XML:', error);
                return { success: false, error: error.message };
            }

            const xmlContent = await data.text();
            return { success: true, xml: xmlContent };

        } catch (err) {
            console.error('Error in retrieveXML:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get list of all XMLs in staging bucket
     * @returns {Promise<Array>} List of XML files
     */
    async listStagingXMLs() {
        try {
            const { data, error } = await this.supabase.storage
                .from(this.stagingBucket)
                .list('', {
                    limit: 100,
                    offset: 0,
                    sortBy: { column: 'created_at', order: 'desc' }
                });

            if (error) {
                console.error('Error listing staging XMLs:', error);
                return [];
            }

            return data || [];

        } catch (err) {
            console.error('Error in listStagingXMLs:', err);
            return [];
        }
    }

    /**
     * Verify XML integrity using stored hash
     * @param {string} submissionId - Submission ID
     * @param {File} currentFile - Current file to verify
     * @returns {Promise<{valid: boolean, message: string}>}
     */
    async verifyXMLIntegrity(submissionId, currentFile) {
        try {
            const { xml, success } = await this.retrieveXML(submissionId, true);
            
            if (!success) {
                return { valid: false, message: 'Could not retrieve XML metadata' };
            }

            // Parse XML and extract stored hash
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xml, 'application/xml');
            const storedHash = xmlDoc.getElementsByTagName('file_hash')[0]?.textContent;

            if (!storedHash) {
                return { valid: false, message: 'No hash found in XML metadata' };
            }

            // Calculate current file hash
            const currentHash = await XMLGenerator.calculateFileHash(currentFile);

            if (storedHash === currentHash) {
                return { valid: true, message: 'File integrity verified' };
            } else {
                return { valid: false, message: 'File hash mismatch - file may have been modified' };
            }

        } catch (err) {
            console.error('Error verifying XML integrity:', err);
            return { valid: false, message: err.message };
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = XMLStagingManager;
}
