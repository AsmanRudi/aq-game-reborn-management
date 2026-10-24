import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('AQ Game Reborn Management - Dashboard & Interactive Controls', () => {
  it('requires staff authentication before rendering operational dashboard data', () => {
    const markup = renderToStaticMarkup(<App />);
    expect(markup).toContain('Login staff');
    expect(markup).toContain('name="email"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain('Akun dan hak akses diverifikasi oleh server.');
    expect(markup).not.toContain('Mulai Rental');
    expect(markup).not.toContain('aria-label="Station PS4-01, Status: Tersedia"');
  });
});
