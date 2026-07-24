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

export const getUsers = async (skip = 0, limit = 100) => {
    const response = await axios.get(`${API_URL}/usuarios?skip=${skip}&limit=${limit}`, getAuthHeaders());
    return response.data;
};

export const createUser = async (userData) => {
    const response = await axios.post(`${API_URL}/usuarios`, userData, getAuthHeaders());
    return response.data;
};

export const updateUser = async (id, userData) => {
    const response = await axios.put(`${API_URL}/usuarios/${id}`, userData, getAuthHeaders());
    return response.data;
};

export const deleteUser = async (id) => {
    const response = await axios.delete(`${API_URL}/usuarios/${id}`, getAuthHeaders());
    return response.data;
};

export const getRoles = async () => {
    const response = await axios.get(`${API_URL}/roles`, getAuthHeaders());
    return response.data;
};
