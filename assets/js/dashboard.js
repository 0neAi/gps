// Global state management
const paymentState = {
    payments: [], // This will now hold LocationTrackerServiceRequest objects
    ws: null,
    paymentTimers: {},
    stats: { active: 0, completed: 0, failed: 0 },
    unreadNotifications: 0
};

// Notification sound
const notificationSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alert-quick-chime-766.mp3');

// Core Functions =============================================================

function togglePaymentSections() {
    const hasPayments = paymentState.payments.length > 0;
    const paymentSection = document.getElementById('payment-section');
    
    if (hasPayments) {
        paymentSection.style.display = 'block';
    } else {
        paymentSection.style.display = 'none';
    }
}

function addNewPayment(request) {
    const existing = paymentState.payments.find(p => p.trxId === request.trxId);
    if (!existing) {
        paymentState.payments.push(request);
        renderPayment(request);
        updateStats();
        togglePaymentSections();
    }
}

async function refreshPayments() {
    const loadingOverlay = document.querySelector('.loading-overlay');
    const authToken = localStorage.getItem('authToken');
    const userID = localStorage.getItem('userID');
    
    try {
        loadingOverlay.style.display = 'flex';
        
        Object.values(paymentState.paymentTimers).forEach(timer => clearInterval(timer));
        paymentState.paymentTimers = {};
        
        // Fetch from the new local endpoint for location tracker service requests
        const response = await fetch('/api/location-tracker/my-service-requests', {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'X-User-ID': userID
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch service requests');
        }
        
        const data = await response.json();
        console.log('Loaded service requests from server:', data.requests);
        
        // Update state with requests
        paymentState.payments = data.requests || [];
        
        // Render requests
        renderAllPayments();
        
        // Update stats
        updateStats();
        
        showSuccess('Service requests refreshed successfully');
    } catch (error) {
        console.error('Service request refresh error:', error);
        showError(error.message || 'Failed to refresh service requests');
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function connectWebSocket() {
    if (paymentState.ws) paymentState.ws.close();
    
    paymentState.ws = new WebSocket('wss://oneai-wjox.onrender.com'); // Assuming WebSocket is still from main oneai

    paymentState.ws.onopen = () => {
        console.log('WebSocket Connected');
        const authToken = localStorage.getItem('authToken');
        const userID = localStorage.getItem('userID');
        
        // Send authentication with userId
        paymentState.ws.send(JSON.stringify({
            type: 'auth',
            token: authToken,
            userId: userID
        }));
    };

    paymentState.ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message:', data);
            
            // Adjust for new service request update type
            if (data.type === 'service-request-updated') {
                // Find and update the request in paymentState.payments
                const updatedRequestIndex = paymentState.payments.findIndex(req => req._id === data.request._id);
                if (updatedRequestIndex !== -1) {
                    paymentState.payments[updatedRequestIndex] = data.request;
                } else {
                    // If not found, add it (e.g., if it was just created)
                    paymentState.payments.push(data.request);
                }
                renderAllPayments(); // Re-render all to ensure UI is up-to-date
                updateStats();

                if (data.request.status === 'Completed') {
                    handlePaymentCompletion(data.request);
                }

                // If deliveredData is part of the message, update the modal if open
                if (data.deliveredData && document.getElementById('payment-details-modal').style.display === 'flex') {
                    const currentRequestId = document.getElementById('payment-details-content').dataset.requestId;
                    if (currentRequestId === data.request._id) {
                        // Re-fetch and display details for the currently open modal
                        window.viewPaymentDetails(data.request.trxId); 
                    }
                }

            } 
            // Adjust for new service request creation type
            else if (data.type === 'new-service-request') {
                addNewPayment(data.request);
            } else if (data.type === 'notification') {
                showSuccess(data.message);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };

    paymentState.ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };

    paymentState.ws.onclose = () => {
        console.log('WebSocket disconnected - attempting to reconnect...');
        setTimeout(connectWebSocket, 5000);
    };
}

function renderAllPayments() {
    const tbody = document.getElementById('payment-status');
    tbody.innerHTML = '';
    
    // Filter for pending requests
    const pendingRequests = paymentState.payments.filter(r => r.status === 'Pending');

    if (pendingRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">No active service requests</td></tr>';
        return;
    }
    
    const sortedRequests = [...pendingRequests].sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    sortedRequests.forEach(renderPayment);
}

function renderPayment(request) {
    const tbody = document.getElementById('payment-status');
    const existingRow = document.querySelector(`tr[data-trxid="${request.trxId}"]`);
    
    if (existingRow) {
        updatePaymentRow(existingRow, request);
        return;
    }
    
    const row = document.createElement('tr');
    row.dataset.trxid = request.trxId;
    const createdAt = new Date(request.createdAt || Date.now());
    
    // Display relevant fields for LocationTrackerServiceRequest
    row.innerHTML = `
        <td><span class="status ${request.status.toLowerCase()}">${request.status}</span></td>
        <td>${request.sourceType === 'imei' ? `IMEI: ${request.imei}` : `Phone: ${request.phoneNumber}`}</td>
        <td>৳${request.serviceCharge.toFixed(2)}</td>
        <td>
            <button class="action-btn small" onclick="viewPaymentDetails('${request.trxId}')">
                <i class="fas fa-eye"></i> View
            </button>
        </td>
    `;
    
    tbody.appendChild(row);
    
    // No countdown for service requests, as it's not directly applicable like payments.
}

// Utility Functions ==========================================================

function updatePaymentStatus(request) {
    const existingRequest = paymentState.payments.find(p => p.trxId === request.trxId);
    if (existingRequest) {
        existingRequest.status = request.status;
        const row = document.querySelector(`tr[data-trxid="${request.trxId}"]`);
        if (row) {
            updatePaymentRow(row, existingRequest);
        }
    }
}

function updatePaymentRow(row, request) {
    const statusCell = row.querySelector('.status');
    if (statusCell) {
        statusCell.className = `status ${request.status.toLowerCase()}`;
        statusCell.textContent = request.status;
    }
    // Removed countdown logic as it's not applicable here
}

// Removed startCountdown as it's not applicable to service requests in the same way as payments.

function updateStats() {
    paymentState.stats = {
        active: paymentState.payments.filter(r => r.status === 'Pending').length,
        completed: paymentState.payments.filter(r => r.status === 'Completed').length,
        failed: paymentState.payments.filter(r => r.status === 'Rejected').length
    };
    
    document.getElementById('active-payments').textContent = paymentState.stats.active;
    document.getElementById('completed-payments').textContent = paymentState.stats.completed;
    document.getElementById('failed-payments').textContent = paymentState.stats.failed;
}

function playNotificationSound() {
    notificationSound.play().catch(e => console.error('Sound playback failed:', e));
}

function showPaymentNotification(request) {
    playNotificationSound();
    
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Service Request Updated', {
            body: `TRX ID: ${request.trxId} - Status: ${request.status}`,
            icon: './image/logo.png'
        });
    }
  
    paymentState.unreadNotifications++;
    const badge = document.getElementById('notification-badge');
    badge.textContent = paymentState.unreadNotifications;
    badge.classList.remove('hidden');
}

function showPaymentPopup(request) {
    const popup = document.getElementById('payment-popup');
    document.getElementById('popup-trxid').textContent = request.trxId;
    document.getElementById('popup-amount').textContent = request.serviceCharge.toFixed(2);
    popup.classList.add('active');
}

function closePaymentPopup() {
    document.getElementById('payment-popup').classList.remove('active');
}

function handlePaymentCompletion(request) {
    showPaymentPopup(request);
    showPaymentNotification(request);
    playNotificationSound();
    
    if ('vibrate' in navigator) {
        navigator.vibrate([300, 100, 300]);
    }
    
    setTimeout(refreshPayments, 2000);
}

function formatCompanyName(sourceType) {
    const names = {
        'imei': 'IMEI Tracking',
        'phoneNumber': 'Phone Number Tracking'
    };
    return names[sourceType] || sourceType;
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'toast error';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'toast success';
    successDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
}

function showAiServices() {
    const aiSection = document.getElementById('ai-services-section');
    if (aiSection.style.display === 'none' || !aiSection.style.display) {
        aiSection.style.display = 'block';
    } else {
        aiSection.style.display = 'none';
    }
}

// Initialization =============================================================

document.addEventListener('DOMContentLoaded', async () => {
    if ('Notification' in window) {
        try {
            await Notification.requestPermission();
        } catch (error) {
            console.error('Notification permission error:', error);
        }
    }
    
    const loadingOverlay = document.querySelector('.loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    try {
        const authToken = localStorage.getItem('authToken');
        const userID = localStorage.getItem('userID');
        
        if (!authToken || !userID) {
            window.location.href = 'index.html';
            return;
        }

        await refreshPayments();
        connectWebSocket();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to load dashboard data');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    } finally {
        loadingOverlay.style.display = 'none';
    }
});

// Global Window Functions ====================================================

window.viewPaymentDetails = async function(trxId) {
    const request = paymentState.payments.find(r => r.trxId === trxId);
    if (request) {
        const detailsContent = document.getElementById('payment-details-content');
        detailsContent.dataset.requestId = request._id; // Store request ID for WebSocket updates
        let detailsHtml = '';
        
        detailsHtml += `<p><strong>Source Type:</strong> ${formatCompanyName(request.sourceType)}</p>`;
        if (request.imei) detailsHtml += `<p><strong>IMEI:</strong> ${request.imei}</p>`;
        if (request.phoneNumber) detailsHtml += `<p><strong>Phone Number:</strong> ${request.phoneNumber}</p>`;
        if (request.lastUsedPhoneNumber) detailsHtml += `<p><strong>Last Used Phone:</strong> ${request.lastUsedPhoneNumber}</p>`;
        
        detailsHtml += `<p><strong>Requested Data:</strong> ${request.dataNeeded.join(', ')}</p>`;
        detailsHtml += `<p><strong>Service Types:</strong> ${request.serviceTypes.join(', ')}</p>`;
        detailsHtml += `<p><strong>Additional Note:</strong> ${request.additionalNote || 'N/A'}</p>`;

        // Fetch delivered data
        try {
            const authToken = localStorage.getItem('authToken');
            const userID = localStorage.getItem('userID');
            const deliveredResponse = await fetch(`/api/location-tracker/delivered-data/${request._id}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'X-User-ID': userID
                }
            });
            if (deliveredResponse.ok) {
                const deliveredData = await deliveredResponse.json();
                if (deliveredData.success && deliveredData.deliveredData.length > 0) {
                    detailsHtml += '<h4>Delivered Data:</h4>';
                    deliveredData.deliveredData.forEach(data => {
                        detailsHtml += `<p><strong>${data.dataType.toUpperCase()}:</strong> ${JSON.stringify(data.dataContent)}</p>`;
                    });
                }
            } else {
                console.error('Failed to fetch delivered data:', deliveredResponse.statusText);
            }
        } catch (error) {
            console.error('Error fetching delivered data:', error);
        }

        detailsContent.innerHTML = `
            <p><strong>TRX ID:</strong> ${request.trxId}</p>
            <p><strong>Amount:</strong> ৳${request.serviceCharge.toFixed(2)}</p>
            <p><strong>Status:</strong> <span class="status ${request.status.toLowerCase()}">${request.status}</span></p>
            <p><strong>Payment Method:</strong> ${request.paymentMethod}</p>
            <p><strong>Submitted:</strong> ${new Date(request.createdAt).toLocaleString()}</p>
            <hr>
            ${detailsHtml}
        `;
        document.getElementById('payment-details-modal').style.display = 'flex';
    } else {
        showError('Service request details not found');
    }
};

window.closePaymentDetailsModal = function() {
    document.getElementById('payment-details-modal').style.display = 'none';
    document.getElementById('payment-details-content').dataset.requestId = ''; // Clear stored ID
};

// Removed premium payment functions as they are not relevant for location tracker dashboard.
window.showPremiumPaymentForm = function() {
    alert('Premium payment form would appear here');
};

window.submitPremiumPayment = async function() {
    alert('Premium payment submission is not available in this dashboard.');
};

window.sendHelpRequest = function() {
    const request = paymentState.payments[0];
    const message = request 
        ? `Need help with service request:\nTRX: ${request.trxId}\nAmount: ৳${request.serviceCharge.toFixed(2)}\nStatus: ${request.status}`
        : 'I need assistance with your location tracker services';
    window.open(`https://wa.me/8801568760780?text=${encodeURIComponent(message)}`, '_blank');
};

window.showHelpInstructions = function() {
    alert("Help instructions:\n1. Check service request status in the table\n2. Use Helpline button for urgent help\n3. Refresh requests every 30 minutes");
};

window.closePaymentPopup = closePaymentPopup;

// Initialize notification badge handler
document.getElementById('notification-badge').addEventListener('click', function() {
    paymentState.unreadNotifications = 0;
    this.classList.add('hidden');
    showSuccess('Notifications cleared');
});

// Mobile menu toggle
document.getElementById('menu-toggle').addEventListener('click', function() {
    alert('Mobile menu would open here');
});
