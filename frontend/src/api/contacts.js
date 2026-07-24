import axios from "axios";
import { getToken } from "./auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

const getAuthHeaders = () => {
    const token = getToken();
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const getContacts = async (skip = 0, limit = 100) => {
    const response = await axios.get(`${API_URL}/contactos?skip=${skip}&limit=${limit}`, getAuthHeaders());
    return response.data;
};

export const createContact = async (contactData) => {
    const response = await axios.post(`${API_URL}/contactos`, contactData, getAuthHeaders());
    return response.data;
};

export const updateContact = async (id, contactData) => {
    const response = await axios.put(`${API_URL}/contactos/${id}`, contactData, getAuthHeaders());
    return response.data;
};

export const deleteContact = async (id) => {
    const response = await axios.delete(`${API_URL}/contactos/${id}`, getAuthHeaders());
    return response.data;
};
