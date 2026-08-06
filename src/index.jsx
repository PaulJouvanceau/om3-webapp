import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter as Router} from 'react-router-dom';
import App from './components/App';
import {ThemeProvider, createTheme} from '@mui/material/styles';
import {grey} from '@mui/material/colors';
import './styles/main.css';
import logger from './utils/logger.js';
import {DarkModeProvider} from './context/DarkModeContext';

export const getDesignTokens = (mode) => ({
    palette: {
        mode,
        ...(mode === 'dark'
            ? {
                // Dark mode palette
                primary: {
                    main: '#90caf9',
                },
                secondary: {
                    main: '#f48fb1',
                },
                background: {
                    default: '#121212',
                    paper: '#1e1e1e',
                },
                text: {
                    primary: '#ffffff',
                    secondary: '#cccccc',
                },
            }
            : {
                // Light mode palette
                primary: {
                    main: grey[900],
                    contrastText: '#fff',
                },
                secondary: {
                    main: grey[600],
                    contrastText: '#fff',
                },
                background: {
                    default: '#ffffff',
                    paper: '#f5f5f5',
                },
            }),
    },
});

const rootElement = document.getElementById('root');
if (rootElement) {
    const pathname = window.location.pathname;
    const uiMatch = pathname.startsWith('/ui') ? '/ui' : '/';
    const root = ReactDOM.createRoot(rootElement);
    // Create the initial theme (will be updated dynamically)
    const theme = createTheme(getDesignTokens('light'));
    root.render(
        <React.StrictMode>
            <DarkModeProvider>
                <ThemeProvider theme={theme}>
                    <Router basename={uiMatch}>
                        <App/>
                    </Router>
                </ThemeProvider>
            </DarkModeProvider>
        </React.StrictMode>
    );
} else {
    logger.error("DOM element with id 'root' not found!");
}
