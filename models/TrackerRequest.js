import mongoose from 'mongoose';

const trackerRequestSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sourceType: {
        type: String,
        required: true,
        enum: ['imei', 'phoneNumber']
    },
    dataNeeded: {
        type: [String],
        required: true,
        enum: ['number', 'location', 'nid', 'callList3Months', 'callList6Months']
    },
    serviceTypes: {
        type: [String],
        required: true,
        enum: [
            'imeiToNumber',
            'numberToLocation',
            'numberToNID',
            'numberToCallList3Months',
            'numberToCallList6Months'
        ]
    },
    imei: {
        type: String,
        trim: true,
        // Optional, required only for imeiToNumber serviceType
    },
    phoneNumber: {
        type: String,
        trim: true,
        // Optional, required for numberToLocation, numberToNID, numberToCallList services
    },
    lastUsedPhoneNumber: {
        type: String,
        trim: true,
        // Optional, for IMEI tracking when user provides last known number
    },
    additionalNote: {
        type: String,
        trim: true,
        maxlength: 500
    },
    serviceCharge: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['Crypto', 'Nagad']
    },
    trxId: {
        type: String,
        required: true,
        trim: true,
        minlength: 8
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Completed'],
        default: 'Pending'
    },
    moderatorNotes: {
        type: String,
        trim: true,
        maxlength: 1000
    }
}, { timestamps: true });

const TrackerRequest = mongoose.model('TrackerRequest', trackerRequestSchema);

export default TrackerRequest;
