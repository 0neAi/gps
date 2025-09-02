document.addEventListener('DOMContentLoaded', () => {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = '<i class="fas fa-spinner fa-spin fa-3x"></i>';
    document.body.appendChild(loadingOverlay);

    const sourceTypeBoxes = document.querySelectorAll('.source-type-options .service-box');
    const dataNeededOptionsContainer = document.getElementById('data-needed-options-container');
    const dataNeededGroup = document.getElementById('data-needed-group');
    const imeiInputGroup = document.getElementById('imei-input-group');
    const lastUsedPhoneInputGroup = document.getElementById('last-used-phone-input-group'); // New
    const phoneInputGroup = document.getElementById('phone-input-group');
    const serviceChargeDisplay = document.getElementById('serviceChargeDisplay');
    const paymentMethodSelect = document.getElementById('method');
    paymentMethodSelect.value = ""; // Ensure no payment method is selected by default
    const termsCheckbox = document.getElementById('terms-checkbox');
    const submitButton = document.getElementById('submit-tracker-button');
    const trackerForm = document.getElementById('tracker-form');
    const confirmationMessageDiv = document.getElementById('confirmation-message');
    const logoutButton = document.getElementById('logout-button'); // New

    let isSubmitting = false;
    const servicePrices = {
        imeiToNumber: 1500,
        numberToLocation: 1000,
        numberToNID: 800,
        numberToCallList3Months: 2000,
        numberToCallList6Months: 3000
    };

    // --- Utility Functions ---
    const validatePhone = phone => /^01[3-9]\d{8}$/.test(phone);

    function showMessage(message, type) {
        confirmationMessageDiv.innerHTML = `<div class="alert-${type}">${message}</div>`;
        confirmationMessageDiv.scrollIntoView({ behavior: 'smooth' });
    }

    function copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        const textToToCopy = element.textContent;
        navigator.clipboard.writeText(textToToCopy).then(() => {
            showMessage('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showMessage('Failed to copy to clipboard.', 'error');
        });
    }

    // --- Core Logic Functions ---

    function updateServiceSelection() {
        const selectedSourceTypeRadio = document.querySelector('input[name="sourceType"]:checked');
        const selectedSourceType = selectedSourceTypeRadio ? selectedSourceTypeRadio.value : null;

        // Reset all source type boxes and data needed options
        sourceTypeBoxes.forEach(box => box.classList.remove('selected'));
        dataNeededOptionsContainer.innerHTML = '';
        dataNeededGroup.style.display = 'none';
        
        // Reset and hide all input fields
        document.getElementById('imei').required = false;
        document.getElementById('imei').value = '';
        imeiInputGroup.style.display = 'none';

        document.getElementById('phoneNumber').required = false;
        document.getElementById('phoneNumber').value = '';
        phoneInputGroup.style.display = 'none';

        document.getElementById('lastUsedPhoneNumber').required = false;
        document.getElementById('lastUsedPhoneNumber').value = '';
        lastUsedPhoneInputGroup.style.display = 'none';

        if (selectedSourceType) {
            // Highlight selected source type box
            selectedSourceTypeRadio.closest('.service-box').classList.add('selected');
            dataNeededGroup.style.display = 'block';

            if (selectedSourceType === 'imei') {
                imeiInputGroup.style.display = 'block';
                document.getElementById('imei').required = true;
                lastUsedPhoneInputGroup.style.display = 'block'; // Show last used phone number input
                // document.getElementById('lastUsedPhoneNumber').required = true; // Optional, as per request

                // Automatically select IMEI to Number and show other options
                dataNeededOptionsContainer.innerHTML += `
                    <div class="service-box selected" data-service-key="imeiToNumber">
                        <input type="checkbox" id="dataNeededNumber" name="dataNeeded" value="number" checked disabled>
                        <label for="dataNeededNumber">Number</label>
                        <span class="price">৳${servicePrices.imeiToNumber.toFixed(2)}</span>
                    </div>
                `;
                // Add other number-based services as selectable checkboxes
                dataNeededOptionsContainer.innerHTML += `
                    <div class="service-box" data-service-key="numberToLocation">
                        <input type="checkbox" id="dataNeededLocation" name="dataNeeded" value="location">
                        <label for="dataNeededLocation">Location</label>
                        <span class="price">৳${servicePrices.numberToLocation.toFixed(2)}</span>
                    </div>
                    <div class="service-box" data-service-key="numberToNID">
                        <input type="checkbox" id="dataNeededNid" name="dataNeeded" value="NID">
                        <label for="dataNeededNid">NID Card Details</label>
                        <span class="price">৳${servicePrices.numberToNID.toFixed(2)}</span>
                    </div>
                    <div class="service-box" data-service-key="numberToCallList3Months">
                        <input type="checkbox" id="dataNeededCallList3Months" name="dataNeeded" value="callList3Months">
                        <label for="dataNeededCallList3Months">Call List (3 Months)</label>
                        <span class="price">৳${servicePrices.numberToCallList3Months.toFixed(2)}</span>
                    </div>
                    <div class="service-box" data-service-key="numberToCallList6Months">
                        <input type="checkbox" id="dataNeededCallList6Months" name="dataNeeded" value="callList6Months">
                        <label for="dataNeededCallList6Months">Call List (6 Months)</label>
                        <span class="price">৳${servicePrices.numberToCallList6Months.toFixed(2)}</span>
                    </div>
                `;
                // phoneInputGroup.style.display = 'block'; // This is no longer needed for IMEI tracking
                // document.getElementById('phoneNumber').required = true; // This is no longer needed for IMEI tracking

            } else if (selectedSourceType === 'phoneNumber') {
                phoneInputGroup.style.display = 'block';
                document.getElementById('phoneNumber').required = true;

                // Add all number-based services as selectable checkboxes
                dataNeededOptionsContainer.innerHTML += `
                    <div class="service-box" data-service-key="numberToLocation">
                        <input type="checkbox" id="dataNeededLocation" name="dataNeeded" value="location">
                        <label for="dataNeededLocation">Location</label>
                        <span class="price">৳${servicePrices.numberToLocation.toFixed(2)}</span>
                    </div>
                    <div class="service-box" data-service-key="numberToNID">
                        <input type="checkbox" id="dataNeededNid" name="dataNeeded" value="NID">
                        <label for="dataNeededNid">NID Card Details</label>
                        <span class="price">৳${servicePrices.numberToNID.toFixed(2)}</span>
                    </div>
                    <div class="service-box" data-service-key="numberToCallList3Months">
                        <input type="checkbox" id="dataNeededCallList3Months" name="dataNeeded" value="callList3Months">
                        <label for="dataNeededCallList3Months">Call List (3 Months)</label>
                        <span class="price">৳${servicePrices.numberToCallList3Months.toFixed(2)}</span>
                    </div>
                    <div class="service-box" data-service-key="numberToCallList6Months">
                        <input type="checkbox" id="dataNeededCallList6Months" name="dataNeeded" value="callList6Months">
                        <label for="dataNeededCallList6Months">Call List (6 Months)</label>
                        <span class="price">৳${servicePrices.numberToCallList6Months.toFixed(2)}</span>
                    </div>
                `;
            }
            // Attach event listeners to newly created checkboxes
            dataNeededOptionsContainer.querySelectorAll('input[name="dataNeeded"]').forEach(checkbox => {
                checkbox.addEventListener('change', handleDataNeededCheckboxChange);
            });
            // Attach event listeners to newly created service boxes for visual feedback
            dataNeededOptionsContainer.querySelectorAll('.service-box').forEach(box => {
                box.addEventListener('click', function() {
                    const checkbox = this.querySelector('input[type="checkbox"]');
                    if (checkbox && !checkbox.disabled) {
                        checkbox.checked = !checkbox.checked;
                        handleDataNeededCheckboxChange({ target: checkbox });
                    }
                });
            });
        }
        updateServiceChargeDisplay();
    }

    function handleDataNeededCheckboxChange(event) {
        const checkbox = event.target;
        const serviceBox = checkbox.closest('.service-box');
        if (checkbox.checked) {
            serviceBox.classList.add('selected');
        } else {
            serviceBox.classList.remove('selected');
        }
        updateServiceChargeDisplay();
    }

    function updateServiceChargeDisplay() {
        const selectedSourceType = document.querySelector('input[name="sourceType"]:checked')?.value;
        let totalCharge = 0;
        let selectedServiceKeys = [];

        if (selectedSourceType === 'imei') {
            // IMEI to Number is always included and its price is added
            totalCharge += servicePrices.imeiToNumber;
            selectedServiceKeys.push('imeiToNumber');
            // Then add prices for any other selected data needed services
            document.querySelectorAll('#data-needed-options-container input[name="dataNeeded"]:checked').forEach(checkbox => {
                const serviceKey = `numberTo${checkbox.value.charAt(0).toUpperCase() + checkbox.value.slice(1)}`;
                if (servicePrices[serviceKey]) {
                    totalCharge += servicePrices[serviceKey];
                    selectedServiceKeys.push(serviceKey);
                }
            });
        } else if (selectedSourceType === 'phoneNumber') {
            // Add prices for all selected data needed services
            document.querySelectorAll('#data-needed-options-container input[name="dataNeeded"]:checked').forEach(checkbox => {
                const serviceKey = `numberTo${checkbox.value.charAt(0).toUpperCase() + checkbox.value.slice(1)}`;
                if (servicePrices[serviceKey]) {
                    totalCharge += servicePrices[serviceKey];
                    selectedServiceKeys.push(serviceKey);
                }
            });
        }
        
        serviceChargeDisplay.value = totalCharge.toFixed(2);
        updatePaymentDisplay();
    }

    async function validateAndPrepareData() {
        const selectedSourceType = document.querySelector('input[name="sourceType"]:checked')?.value;
        const selectedDataNeededCheckboxes = document.querySelectorAll('#data-needed-options-container input[name="dataNeeded"]:checked');
        const selectedDataNeeded = Array.from(selectedDataNeededCheckboxes).map(cb => cb.value);
        
        const imei = document.getElementById('imei').value.trim();
        const phoneNumber = document.getElementById('phoneNumber').value.trim();
        const lastUsedPhoneNumber = document.getElementById('lastUsedPhoneNumber').value.trim(); // New
        const additionalNote = document.getElementById('additionalNote').value.trim();
        const method = paymentMethodSelect.value;
        const trxid = document.getElementById('trxid').value.trim();
        const serviceCharge = parseFloat(serviceChargeDisplay.value);

        if (!selectedSourceType) {
            throw new Error('Please select a source type (IMEI or Mobile Number).');
        }

        let serviceTypesForBackend = [];

        if (selectedSourceType === 'imei') {
            if (!imei) throw new Error('IMEI Number is required.');
            serviceTypesForBackend.push('imeiToNumber'); // Always include this for IMEI tracking
            if (selectedDataNeeded.length === 0) {
                throw new Error('Please select at least one data needed service.');
            }
            selectedDataNeeded.forEach(data => {
                serviceTypesForBackend.push(`numberTo${data.charAt(0).toUpperCase() + data.slice(1)}`);
            });
        } else if (selectedSourceType === 'phoneNumber') {
            if (!validatePhone(phoneNumber)) throw new Error('Valid Mobile Number is required.');
            if (selectedDataNeeded.length === 0) {
                throw new Error('Please select at least one data needed service.');
            }
            selectedDataNeeded.forEach(data => {
                serviceTypesForBackend.push(`numberTo${data.charAt(0).toUpperCase() + data.slice(1)}`);
            });
        }

        if (serviceTypesForBackend.length === 0) {
            throw new Error('No services selected.');
        }

        if (!method) {
            throw new Error('Please select a payment gateway.');
        }

        if (!trxid || trxid.length < 8) {
            throw new Error('TRX ID must be at least 8 characters.');
        }
        
        if (serviceCharge <= 0) {
            throw new Error('Service charge must be greater than 0. Please select services.');
        }

        return {
            sourceType: selectedSourceType,
            dataNeeded: selectedDataNeeded, // Array of selected data needed
            serviceTypes: serviceTypesForBackend, // Array of full service keys for backend
            imei: selectedSourceType === 'imei' ? imei : undefined,
            phoneNumber: selectedSourceType === 'phoneNumber' ? phoneNumber : undefined,
            lastUsedPhoneNumber: selectedSourceType === 'imei' && lastUsedPhoneNumber ? lastUsedPhoneNumber : undefined, // New
            additionalNote,
            serviceCharge,
            paymentMethod: method,
            trxId: trxid
        };
    }

    trackerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        try {
            const authToken = localStorage.getItem('authToken');
            const userID = localStorage.getItem('userID');
            const tokenExp = localStorage.getItem('tokenExp');

            if (!authToken || !userID || !tokenExp || Date.now() > parseInt(tokenExp)) {
                showMessage('Session expired or invalid. Please log in again.', 'error');
                localStorage.clear();
                setTimeout(() => { window.location.href = '../oneai-main/index.html'; }, 1500); // Redirect to main login
                return;
            }

            isSubmitting = true;
            loadingOverlay.style.display = 'flex';
            confirmationMessageDiv.innerHTML = '';

            const formData = await validateAndPrepareData();

            const response = await fetch('/api/location-tracker/submit-service', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'X-User-ID': userID
                },
                body: JSON.stringify(formData)
            });

            const responseData = await response.json();
            
            if (response.ok) {
                handleSuccess(responseData, formData);
            } else {
                handleServerError(responseData);
            }
        } catch (error) {
            handleNetworkError(error);
        } finally {
            isSubmitting = false;
            loadingOverlay.style.display = 'none';
        }
    });

    function handleSuccess(data, formData) {
        // Construct WhatsApp message
        const selectedServicesList = formData.serviceTypes.map(serviceKey => {
            let name = '';
            let price = servicePrices[serviceKey];
            if (serviceKey === 'imeiToNumber') name = 'IMEI to Number';
            else if (serviceKey === 'numberToLocation') name = 'Number to Location';
            else if (serviceKey === 'numberToNID') name = 'Number to NID Card Details';
            else if (serviceKey === 'numberToCallList3Months') name = 'Number to Call List (3 Months)';
            else if (serviceKey === 'numberToCallList6Months') name = 'Number to Call List (6 Months)';
            return `- ${name} (৳${price.toFixed(2)})`;
        }).join('\n');

        const whatsappMessage = `
New Location Tracker Service Request:
` +
            `Source Type: ${formData.sourceType === 'imei' ? `IMEI (${formData.imei})` : `Mobile Number (${formData.phoneNumber})`}
` +
            `${formData.sourceType === 'imei' && formData.lastUsedPhoneNumber ? `Last Used Phone: ${formData.lastUsedPhoneNumber}
` : ''}` +
            `Selected Services:
${selectedServicesList}
` +
            `Additional Note: ${formData.additionalNote || 'N/A'}
` +
            `Total Service Charge: ৳${formData.serviceCharge.toFixed(2)}
` +
            `Payment Method: ${formData.paymentMethod}
` +
            `TRX ID: ${formData.trxId}
` +
            `User ID: ${localStorage.getItem('userID')}`;

        // Open WhatsApp chat in a new tab
        window.open(`https://wa.me/8801568760780?text=${encodeURIComponent(whatsappMessage)}`, '_blank'); // Helpline number

        showMessage('Service request submitted successfully! Redirecting...', 'success');
        setTimeout(() => window.location.href = '../oneai-main/dashboard.html', 2000); // Redirect to main dashboard
    }

    function handleServerError(responseData) {
        let errorMessage = 'Service request failed';
        if (responseData.errors) {
            errorMessage = responseData.errors.map(err => err.msg || err.message).join(', ');
        } else if (responseData.message) {
            errorMessage = responseData.message;
        }
        showMessage(errorMessage, 'error');
    }

    function handleNetworkError(error) {
        console.error('Network error:', error);
        showMessage('Network error. Please check your connection and try again.', 'error');
    }

    function clearForm() {
        if (confirm('Are you sure you want to clear the form?')) {
            trackerForm.reset();
            updateServiceSelection(); // Reset input visibility and charge
            updatePaymentDisplay(); // Reset payment info
            termsCheckbox.checked = false;
            submitButton.disabled = true;
            confirmationMessageDiv.innerHTML = '';
        }
    }

    // --- Event Listeners ---
    sourceTypeBoxes.forEach(box => {
        box.addEventListener('click', function() {
            const radio = this.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                updateServiceSelection();
            }
        });
    });
    // dataNeededSelect.addEventListener('change', updateServiceChargeDisplay); // Removed, now handled by checkboxes
    paymentMethodSelect.addEventListener('change', updatePaymentDisplay);
    termsCheckbox.addEventListener('change', () => {
        submitButton.disabled = !termsCheckbox.checked;
    });

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('copy-btn') || e.target.closest('.copy-btn')) {
            const targetId = e.target.closest('.copy-btn').getAttribute('data-target');
            copyToClipboard(targetId);
        }
    });

    logoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.clear();
        window.location.href = 'index.html'; // Redirect to tracker login page
    });

    // Initial setup
    updateServiceSelection(); // Call initially to set up the form state
    updatePaymentDisplay();
});
