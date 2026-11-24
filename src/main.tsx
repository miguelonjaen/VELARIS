import {createRoot} from 'react-dom/client';
import Bootstrap from './Bootstrap';
import ErrorBoundary from './shared/components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <ErrorBoundary fallbackName="interfaz de GAULOS">
        <Bootstrap />
    </ErrorBoundary>

);
