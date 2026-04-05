const { test, expect } = require('@playwright/test');

test('generate doors and windows via AI chat', async ({ page }) => {
  await page.goto('http://localhost:5174/');
  
  // Wait for AI chat input
  const aiInput = page.locator('.chat-input input');
  await aiInput.waitFor();
  
  // Type command
  await aiInput.fill('create a 5x4 room with a door and a window');
  await aiInput.press('Enter');
  
  // Wait for walls to render in 2D
  await page.waitForTimeout(1000);
  
  // Take screenshot of 2D canvas
  await page.screenshot({ path: 'c:/Users/manid/.gemini/antigravity/brain/88c898a2-8214-42c9-9a5d-4c46842b410e/playwright_2d.png' });
  
  // Switch to 3D
  await page.getByRole('button', { name: '3D View' }).click();
  
  // Wait for 3D canvas to render
  await page.waitForTimeout(1000);
  
  // Take screenshot of 3D canvas
  await page.screenshot({ path: 'c:/Users/manid/.gemini/antigravity/brain/88c898a2-8214-42c9-9a5d-4c46842b410e/playwright_3d.png' });
});
