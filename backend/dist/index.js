"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("./database");
const schema_1 = require("./schema");
const simulator_1 = require("./simulator");
// Import Routes
const auth_1 = __importDefault(require("./routes/auth"));
const sales_1 = __importDefault(require("./routes/sales"));
const losses_1 = __importDefault(require("./routes/losses"));
const transfers_1 = __importDefault(require("./routes/transfers"));
const inventory_1 = __importDefault(require("./routes/inventory"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
// Mount API routes
app.use('/api/v1/auth', auth_1.default);
app.use('/api/v1/sales', sales_1.default);
app.use('/api/v1/losses', losses_1.default);
app.use('/api/v1/transfers', transfers_1.default);
app.use('/api/v1', inventory_1.default); // /departments, /ingredients, /recipes, /stocks
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        mode: database_1.isDemoMode ? 'demo-in-memory' : 'postgres-active',
        timestamp: new Date()
    });
});
async function startServer() {
    // 1. Verify PostgreSQL connection
    await (0, database_1.checkConnection)();
    // 2. Initialize Database Tables if Postgres is active
    if (!database_1.isDemoMode) {
        await (0, schema_1.initializeDatabase)();
    }
    // 3. Start listening
    app.listen(PORT, () => {
        console.log(`[mePOS STOCK API] Server is running on port ${PORT} in ${database_1.isDemoMode ? 'DEMO' : 'PRODUCTION'} mode.`);
        // 4. Start Background Sales Simulator
        (0, simulator_1.startSalesSimulator)();
    });
}
startServer().catch(err => {
    console.error('Failed to start mePOS stock backend server:', err);
});
