import React from 'react';
import ReactDOM from 'react-dom/client';
import ProductSite from './ProductSite';
import BusinessModelPortal from './components/BusinessModelPortal';
import './tokens.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProductSite />
    <BusinessModelPortal />
  </React.StrictMode>,
);
