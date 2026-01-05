const core = require('@actions/core');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://public-api.rustore.ru';

/**
 * Generate RuStore auth token
 */
async function getAuthToken(keyId, privateKeyBase64) {
    core.info('Generating authorization token...');

    // Generate timestamp in ISO 8601 format
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');

    // Decode private key from base64
    const privateKeyDer = Buffer.from(privateKeyBase64, 'base64');

    // Convert DER to PEM format
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyDer.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;

    // Create signature: SHA512 sign of (keyId + timestamp)
    const dataToSign = `${keyId}${timestamp}`;
    const sign = crypto.createSign('RSA-SHA512');
    sign.update(dataToSign);
    const signature = sign.sign(privateKeyPem, 'base64');

    const body = JSON.stringify({
        keyId,
        timestamp,
        signature
    });

    core.info(`POST ${BASE_URL}/public/auth/`);

    const response = await fetch(`${BASE_URL}/public/auth/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
    });

    const data = await response.json();

    if (data.code !== 'OK') {
        throw new Error(`Authorization failed: ${JSON.stringify(data)}`);
    }

    core.info('Authorization successful');
    return data.body.jwe;
}

/**
 * Create draft or get existing draft ID
 */
async function createOrGetDraft(token, applicationId, whatsNew, publishType) {
    core.info(`Creating draft for application: ${applicationId}`);

    const body = JSON.stringify({
        whatsNew: whatsNew || '',
        publishType: publishType || 'MANUAL'
    });

    const response = await fetch(
        `${BASE_URL}/public/v1/application/${applicationId}/version`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Public-Token': token
            },
            body
        }
    );

    const data = await response.json();

    if (data.code === 'OK') {
        core.info(`Draft created successfully, version ID: ${data.body}`);
        return data.body;
    }

    // Check if draft already exists - extract ID from error message
    if (data.message && data.message.includes('ID =')) {
        core.warning('Draft already exists, extracting ID from error message...');

        const match = data.message.match(/ID\s*=\s*(\d+)/);
        if (match) {
            const existingId = parseInt(match[1], 10);
            core.info(`Using existing draft with ID: ${existingId}`);
            return existingId;
        }
    }

    throw new Error(`Failed to create draft: ${JSON.stringify(data)}`);
}

/**
 * Upload APK file
 */
async function uploadApk(token, applicationId, versionId, filePath, mobileServices) {
    core.info(`Uploading APK: ${filePath}`);
    core.info(`Services type: ${mobileServices}`);

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    formData.append('servicesType', mobileServices || 'Unknown');
    formData.append('isMainApk', 'true');

    const response = await fetch(
        `${BASE_URL}/public/v1/application/${applicationId}/version/${versionId}/apk`,
        {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'Public-Token': token
            },
            body: formData
        }
    );

    const data = await response.json();

    if (data.code !== 'OK') {
        throw new Error(`APK upload failed: ${JSON.stringify(data)}`);
    }

    core.info('APK uploaded successfully');
}

/**
 * Upload AAB file
 */
async function uploadAab(token, applicationId, versionId, filePath) {
    core.info(`Uploading AAB: ${filePath}`);

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);

    const response = await fetch(
        `${BASE_URL}/public/v1/application/${applicationId}/version/${versionId}/aab`,
        {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'Public-Token': token
            },
            body: formData
        }
    );

    const data = await response.json();

    if (data.code !== 'OK') {
        throw new Error(`AAB upload failed: ${JSON.stringify(data)}`);
    }

    core.info('AAB uploaded successfully');
}

/**
 * Submit for review
 */
async function submitForReview(token, applicationId, versionId, priorityUpdate) {
    core.info(`Submitting version ${versionId} for review (priority: ${priorityUpdate})...`);

    const response = await fetch(
        `${BASE_URL}/public/v1/application/${applicationId}/version/${versionId}/commit?priorityUpdate=${priorityUpdate}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Public-Token': token
            }
        }
    );

    const data = await response.json();

    if (data.code !== 'OK') {
        throw new Error(`Submit failed: ${JSON.stringify(data)}`);
    }

    core.info('Submitted for review successfully');
}

/**
 * Main function
 */
async function run() {
    try {
        core.info('RuStore Publish Action');
        core.info('======================');

        // Get inputs
        const keyId = core.getInput('key_id', { required: true });
        const privateKey = core.getInput('private_key', { required: true });
        const applicationId = core.getInput('application_id', { required: true });
        const filePath = core.getInput('file', { required: true });
        const whatsNew = core.getInput('whats_new', { required: true });
        const publishType = core.getInput('publish_type') || 'MANUAL';
        const mobileServices = core.getInput('mobile_services') || 'Unknown';
        const priorityUpdate = parseInt(core.getInput('priority_update') || '0', 10);
        const shouldSubmit = core.getInput('submit') !== 'false';

        // Validate file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        // Determine file format
        const fileExt = path.extname(filePath).toLowerCase().slice(1);
        if (fileExt !== 'apk' && fileExt !== 'aab') {
            throw new Error(`Unsupported file format: ${fileExt}. Expected 'apk' or 'aab'`);
        }
        core.info(`File format: ${fileExt}`);

        // Get auth token
        const token = await getAuthToken(keyId, privateKey);

        // Create draft or get existing
        const versionId = await createOrGetDraft(token, applicationId, whatsNew, publishType);

        // Upload file
        if (fileExt === 'apk') {
            await uploadApk(token, applicationId, versionId, filePath, mobileServices);
        } else {
            await uploadAab(token, applicationId, versionId, filePath);
        }

        // Submit for review (if enabled)
        if (shouldSubmit) {
            await submitForReview(token, applicationId, versionId, priorityUpdate);
            core.setOutput('status', 'submitted');
        } else {
            core.info(`Skipping submit (submit=false). Draft ID: ${versionId}`);
            core.setOutput('status', 'draft');
        }

        // Set outputs
        core.setOutput('version_id', versionId);

        core.info('======================');
        core.info('Publication completed!');
        core.info(`Version ID: ${versionId}`);

    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
