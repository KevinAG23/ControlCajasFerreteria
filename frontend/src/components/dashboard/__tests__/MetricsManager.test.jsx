import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetricsManager from '../MetricsManager';
import * as metricsApi from '../../../api/metrics';

// Mock the API module
vi.mock('../../../api/metrics', () => ({
  getCategories: vi.fn(),
  getQuestions: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
}));

const mockCategories = [
  { id: 'cat-1', nombre: 'Atención al Cliente' },
  { id: 'cat-2', nombre: 'Velocidad' }
];

const mockQuestions = [
  { 
    id: 'q-1', 
    categoria_id: 'cat-1', 
    texto_pregunta: '¿El cajero fue amable?', 
    peso_puntaje: 5,
    tipo_respuesta: 'ESCALA_NUMERICA' 
  }
];

describe('MetricsManager Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    metricsApi.getCategories.mockResolvedValue(mockCategories);
    metricsApi.getQuestions.mockResolvedValue(mockQuestions);
    
    render(<MetricsManager />);
    expect(screen.getByText(/Cargando configuración de métricas/i)).toBeInTheDocument();
  });

  it('fetches and displays categories and questions', async () => {
    metricsApi.getCategories.mockResolvedValue(mockCategories);
    metricsApi.getQuestions.mockResolvedValue(mockQuestions);
    
    render(<MetricsManager />);
    
    // Wait for the categories to load
    await waitFor(() => {
      expect(screen.getByText('Atención al Cliente')).toBeInTheDocument();
      expect(screen.getByText('Velocidad')).toBeInTheDocument();
    });

    // Expand the category to see the question
    const expandButtons = screen.getAllByRole('button');
    // Assuming the first button is the "Nueva Categoría" button, others are toggles/edit/delete
    // We will find the category header and click it. It's usually a div that has onClick toggling.
    // Instead of raw clicking, we can check for text that tells us the question exists after expanding.
    const user = userEvent.setup();
    const categoryButton = screen.getByText('Atención al Cliente');
    await user.click(categoryButton);
    
    await waitFor(() => {
      expect(screen.getByText('¿El cajero fue amable?')).toBeInTheDocument();
    });
  });

  it('opens category modal when clicking New Category', async () => {
    metricsApi.getCategories.mockResolvedValue(mockCategories);
    metricsApi.getQuestions.mockResolvedValue(mockQuestions);
    
    render(<MetricsManager />);
    
    await waitFor(() => {
      expect(screen.getByText('Atención al Cliente')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    // Assuming there's a button "Nueva Categoría"
    const newCatBtn = screen.getByRole('button', { name: /Nueva Categoría/i });
    await user.click(newCatBtn);

    expect(screen.getByText('Nueva Categoría')).toBeInTheDocument(); // Modal header
    expect(screen.getByPlaceholderText(/Nombre de la categoría/i)).toBeInTheDocument();
  });
});
