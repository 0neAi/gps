const API_BASE = 'http://localhost:10001'; // Assuming tracker service runs on 10001

const AdminApp = {
    data() {
        return {
            isLoading: true,
            authenticated: false,
            loginError: '',
            credentials: {
                email: '',
                password: ''
            },
            trackerRequests: [],
            requestFilter: 'all',
            selectedRequest: null, // For viewing/updating a single tracker request
            requestDetailsModal: null, // Bootstrap modal instance for details
            deliverDataModal: null, // Bootstrap modal instance for data delivery
            deliverDataForm: {
                dataType: '',
                dataContent: ''
            },
            stats: {
                totalRequests: 0,
                pendingRequests: 0,
                completedRequests: 0
            },
            ws: null // WebSocket instance
        };
    },
    computed: {
        filteredRequests() {
            if (this.requestFilter === 'all') {
                return this.trackerRequests;
            }
            return this.trackerRequests.filter(req => req.status === this.requestFilter);
        }
    },
    methods: {
        async login() {
            this.loginError = '';
            try {
                // Assuming admin login is handled by the main oneai server
                const response = await axios.post(`https://oneai-wjox.onrender.com/admin/login`, this.credentials);
                localStorage.setItem('adminToken', response.data.token);
                // Set default Authorization header for all subsequent requests
                axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
                this.authenticated = true;
                this.loadData();
                this.initWebSocket();
            } catch (error) {
                this.loginError = 'Invalid credentials. Please try again.';
                console.error('Login failed:', error);
            }
        },
        logout() {
            localStorage.removeItem('adminToken');
            this.authenticated = false;
            if (this.ws) {
                this.ws.close();
            }
        },
        async loadData() {
            this.isLoading = true;
            try {
                // Fetch all location tracker requests for admin
                const response = await axios.get(`${API_BASE}/admin/tracker/requests`);
                this.trackerRequests = response.data.requests || [];

                // Calculate stats
                this.stats.totalRequests = this.trackerRequests.length;
                this.stats.pendingRequests = this.trackerRequests.filter(req => req.status === 'Pending').length;
                this.stats.completedRequests = this.trackerRequests.filter(req => req.status === 'Completed').length;

            } catch (error) {
                console.error('Data loading error:', error);
                if (error.response && error.response.status === 401) {
                    this.logout();
                }
            } finally {
                this.isLoading = false;
            }
        },
        initWebSocket() {
            if (this.ws) this.ws.close();
            // Connect to the tracker service's WebSocket
            this.ws = new WebSocket(`ws://localhost:10001`); // Use ws for local development

            this.ws.onopen = () => {
                console.log('Admin WebSocket connected to Tracker Service');
                const token = localStorage.getItem('adminToken');
                if (token) {
                    // Send authentication for admin
                    this.ws.send(JSON.stringify({ type: 'auth', token: token, role: 'admin' }));
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Admin WebSocket message:', data);
                    // Reload data on relevant updates
                    if (data.type === 'new-service-request' || data.type === 'service-request-updated') {
                        this.loadData();
                    }
                } catch (error) {
                    console.error('Admin WebSocket message error:', error);
                }
            };

            this.ws.onerror = (error) => console.error('Admin WebSocket error:', error);
            this.ws.onclose = () => {
                console.log('Admin WebSocket disconnected - attempting to reconnect...');
                setTimeout(() => this.initWebSocket(), 3000);
            };
        },
        async showRequestDetails(request) {
            this.selectedRequest = { ...request };
            // Fetch delivered data for this request
            try {
                const response = await axios.get(`${API_BASE}/api/location-tracker/delivered-data/${request._id}`);
                if (response.data.success) {
                    this.selectedRequest.deliveredData = response.data.deliveredData;
                } else {
                    this.selectedRequest.deliveredData = [];
                }
            } catch (error) {
                console.error('Error fetching delivered data:', error);
                this.selectedRequest.deliveredData = [];
            }

            if (!this.requestDetailsModal) {
                this.requestDetailsModal = new bootstrap.Modal(
                    document.getElementById('requestDetailsModal')
                );
            }
            this.requestDetailsModal.show();
        },
        showDeliverDataModal(request) {
            this.selectedRequest = { ...request }; // Set the request to deliver data for
            this.deliverDataForm.dataType = ''; // Reset form
            this.deliverDataForm.dataContent = ''; // Reset form
            if (!this.deliverDataModal) {
                this.deliverDataModal = new bootstrap.Modal(
                    document.getElementById('deliverDataModal')
                );
            }
            this.deliverDataModal.show();
        },
        async deliverData() {
            if (!this.selectedRequest || !this.deliverDataForm.dataType || !this.deliverDataForm.dataContent) {
                alert('Please select a request and fill in all data delivery fields.');
                return;
            }

            try {
                this.isLoading = true;
                const response = await axios.post(`${API_BASE}/admin/deliver-data`, {
                    requestId: this.selectedRequest._id,
                    dataType: this.deliverDataForm.dataType,
                    dataContent: this.deliverDataForm.dataContent // Send as string, backend will parse if needed
                });

                if (response.data.success) {
                    alert('Data delivered successfully!');
                    this.deliverDataModal.hide();
                    this.loadData(); // Reload data to update status and delivered data
                } else {
                    alert(response.data.message || 'Failed to deliver data.');
                }
            } catch (error) {
                console.error('Error delivering data:', error);
                alert('Error delivering data.');
            } finally {
                this.isLoading = false;
            }
        },
        async deleteRequest(id) {
            if (!confirm('Are you sure you want to delete this request? This action cannot be undone.')) return;
            try {
                this.isLoading = true;
                const response = await axios.delete(`${API_BASE}/admin/tracker/requests/${id}`); // Assuming a delete endpoint
                if (response.data.success) {
                    alert('Request deleted successfully!');
                    this.loadData();
                } else {
                    alert(response.data.message || 'Failed to delete request.');
                }
            } catch (error) {
                console.error('Error deleting request:', error);
                alert('Error deleting request.');
            } finally {
                this.isLoading = false;
            }
        }
    },
    mounted() {
        const token = localStorage.getItem('adminToken');
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            this.authenticated = true;
            this.loadData();
            this.initWebSocket();
        }
    }
};

const app = Vue.createApp(AdminApp);
app.mount('#admin-app');