class XMLStagingManager {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.stagingBucket = 'submission-staging';     
        this.permanentBucket = 'faculty-submissions';   
    }

    async storeXMLInStaging(submissionId, xmlContent) {
        try {
            const fileName = `${submissionId}/metadata.xml`;
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

    async moveXMLToPermanent(submissionId, adminId) {
        try {
            const stagingPath = `${submissionId}/metadata.xml`;
            const permanentPath = `approved/${submissionId}/metadata.xml`;
            const { data: fileData, error: readError } = await this.supabase.storage
                .from(this.stagingBucket)
                .download(stagingPath);

            if (readError) {
                console.error('Error reading XML from staging:', readError);
                return { success: false, error: readError.message };
            }
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
            const approvalPath = `approved/${submissionId}/approval-record.xml`;
            const approvalXML = XMLGenerator.generateApprovalXML(submissionId, adminId, 'Approved');
            
            await this.supabase.storage
                .from(this.permanentBucket)
                .upload(approvalPath, new Blob([approvalXML], { type: 'application/xml' }), {
                    cacheControl: '86400',
                    upsert: true
                });

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

    async cleanupXMLOnRejection(submissionId, adminId, rejectionReason) {
        try {
            const stagingPath = `${submissionId}/metadata.xml`;
            const rejectionXML = XMLGenerator.generateRejectionXML(submissionId, adminId, rejectionReason);
            const rejectionPath = `rejected/${submissionId}/rejection-record.xml`;

            await this.supabase.storage
                .from(this.stagingBucket)
                .upload(rejectionPath, new Blob([rejectionXML], { type: 'application/xml' }), {
                    cacheControl: '3600',
                    upsert: true
                });
            const { error: deleteError } = await this.supabase.storage
                .from(this.stagingBucket)
                .remove([stagingPath]);

            if (deleteError) {
                console.warn('Could not delete staging XML:', deleteError);
            }

            console.log(`✓ XML cleaned up from staging, rejection record stored`);
            return { success: true };

        } catch (err) {
            console.error('Error in cleanupXMLOnRejection:', err);
            return { success: false, error: err.message };
        }
    }

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

    async verifyXMLIntegrity(submissionId, currentFile) {
        try {
            const { xml, success } = await this.retrieveXML(submissionId, true);
            
            if (!success) {
                return { valid: false, message: 'Could not retrieve XML metadata' };
            }
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xml, 'application/xml');
            const storedHash = xmlDoc.getElementsByTagName('file_hash')[0]?.textContent;

            if (!storedHash) {
                return { valid: false, message: 'No hash found in XML metadata' };
            }
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
if (typeof module !== 'undefined' && module.exports) {
    module.exports = XMLStagingManager;
}
