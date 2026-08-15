import { GoogleGenAI } from '@google/genai';
import {
    GEMINI_API_KEY
} from '../config/kaori.js';

export const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});