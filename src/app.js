import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app=express();

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Common inbuilt middlewares
app.use(express.json({limit: '16kb'}));
app.use(express.urlencoded({extended: true, limit: '16kb'}));  
app.use(express.static('public'));
app.use(cookieParser());

// import routes
import healthCheckRoutes from './routes/healthcheck.routes.js';

// routes
app.use('/api/v1/healthcheck', healthCheckRoutes);

export {app};