import { test, expect, Page, Locator } from '@playwright/test';

const HOST = process.env.TEST_HOST;
const PASSWORD = process.env.DROPLET_PASSWORD;

if (!HOST) {
  throw new Error('TEST_HOST is not defined');
}

if (!PASSWORD) {
  throw new Error('DROPLET_PASSWORD is not defined');
}

const BASE_URL = `https://${HOST}`;
const NEXTCLOUD_URL = `${BASE_URL}/nextcloud`;
const DOCUMENT_SERVER_URL = `${BASE_URL}/onlyoffice-documentserver/`;

const USERNAME = 'Administrator';


const CLICK_DELAY = 10_000;
const EDITOR_OPEN_DELAY = 50_000;

function logProgress(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[ONLYOFFICE E2E] ${timestamp} - ${message}`);
}

test.use({
  ignoreHTTPSErrors: true,
  actionTimeout: 0,
  navigationTimeout: 0,
});

test.setTimeout(0);

test('Create and save ONLYOFFICE files in Nextcloud', async ({ page }) => {
  logProgress('Test started');

  try {
    await test.step('Login to Nextcloud', async () => {
      await login(page);
    });

    await test.step('Open ONLYOFFICE settings and configure document server', async () => {
      await openOnlyofficeSettings(page);
      await configureDocumentServer(page, DOCUMENT_SERVER_URL);
    });

    await test.step('Open Files app', async () => {
      await openFiles(page);
    });

    await test.step('Create and edit document', async () => {
      await createAndOpenFile(page, 'New document');
      await writeDocumentText(page);
      await closeEditorAndReturnToFiles(page);
    });

    await test.step('Create and edit presentation', async () => {
      await createAndOpenFile(page, 'New presentation');
      await writePresentationText(page);
      await closeEditorAndReturnToFiles(page);
    });

    await test.step('Create and edit spreadsheet', async () => {
      await createAndOpenFile(page, 'New spreadsheet');
      await writeSpreadsheetText(page);
      await closeEditorAndReturnToFiles(page);
    });

    logProgress('Test finished successfully');
  } catch (error) {
    logProgress(`Test failed: ${getErrorMessage(error)}`);
    throw error;
  }
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function clickWithDelay(locator: Locator): Promise<void> {
  await locator.click();
  await locator.page().waitForTimeout(CLICK_DELAY);
}

async function login(page: Page): Promise<void> {
  logProgress('Opening Nextcloud login page');
  await page.goto(
    `${NEXTCLOUD_URL}/apps/user_saml/saml/selectUserBackEnd?redirectUrl=`,
    { waitUntil: 'domcontentloaded' }
  );

  await clickWithDelay(page.getByRole('link', { name: 'Direct log in' }));

  await page.getByRole('textbox', { name: 'Account name' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);

  await Promise.all([
    page.waitForURL(/\/nextcloud\//),
    page.getByRole('button', { name: 'Log in', exact: true }).click(),
  ]);

  await page.waitForTimeout(CLICK_DELAY);
  const closeButton = page.getByRole('button', { name: 'Close' });

  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }

  await expect(
    page.getByRole('button', { name: 'Settings menu' })
  ).toBeVisible();
}

async function openOnlyofficeSettings(page: Page): Promise<void> {
  logProgress('Opening ONLYOFFICE settings page in Nextcloud admin');
  await expect(
    page.getByRole('button', { name: 'Settings menu' })
  ).toBeVisible();

  await clickWithDelay(page.getByRole('button', { name: 'Settings menu' }));

  await expect(
    page.getByRole('link', { name: 'Administration settings' })
  ).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/nextcloud\/settings\/admin/),
    page.getByRole('link', { name: 'Administration settings' }).click(),
  ]);

  await page.waitForTimeout(CLICK_DELAY);

  await expect(page.getByRole('link', { name: 'ONLYOFFICE' })).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/nextcloud\/settings\/admin\/onlyoffice/),
    page.getByRole('link', { name: 'ONLYOFFICE' }).click(),
  ]);

  await page.waitForTimeout(CLICK_DELAY);

  await expect(
    page.getByRole('textbox', { name: 'https://<documentserver>/' })
  ).toBeEditable();
}

async function configureDocumentServer(
  page: Page,
  documentServerUrl: string
): Promise<void> {
  logProgress(`Configuring document server URL: ${documentServerUrl}`);
  const dsInput = page.getByRole('textbox', {
    name: 'https://<documentserver>/',
  });

  await expect(dsInput).toBeEditable();

  const closeErrorButton = page.getByRole('button', { name: 'Close' });
  if (await closeErrorButton.isVisible().catch(() => false)) {
    await clickWithDelay(closeErrorButton);
  }

  await dsInput.fill(documentServerUrl);

  const insecureCheckbox = page.getByRole('checkbox', {
    name: 'Disable certificate verification (insecure)',
  });

  const insecureLabel = page.getByText(
    'Disable certificate verification (insecure)'
  );

  await insecureLabel.scrollIntoViewIfNeeded();
  await expect(insecureCheckbox).toBeAttached();

  if (!(await insecureCheckbox.isChecked())) {
    await insecureLabel.click();
    await page.waitForTimeout(CLICK_DELAY);
    await expect(insecureCheckbox).toBeChecked();
  }

  const saveAddressButton = page.locator('#onlyofficeAddrSave');
  await expect(saveAddressButton).toBeEnabled();
  await clickWithDelay(saveAddressButton);

  const okButton = page.getByRole('button', { name: 'Ok' });
  if (await okButton.isVisible().catch(() => false)) {
    const dialog = page.getByRole('dialog').first();
    const dialogText = (await dialog.textContent().catch(() => null))?.trim();

    logProgress(
      `ONLYOFFICE configuration save failed${dialogText ? `: ${dialogText}` : ''}`
    );
    await clickWithDelay(okButton);

    throw new Error(
      `Failed to save ONLYOFFICE configuration${dialogText ? `: ${dialogText}` : ''}`
    );
  }

  logProgress('ONLYOFFICE configuration saved without visible error dialog');
}

async function openFiles(page: Page): Promise<void> {
  logProgress('Opening Files app');
  const filesLink = page.getByRole('link', { name: 'Files' }).first();

  if (await filesLink.isVisible().catch(() => false)) {
    await clickWithDelay(filesLink);
  } else {
    await page.goto(`${NEXTCLOUD_URL}/apps/files/files`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(CLICK_DELAY);
  }

  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
}

async function createAndOpenFile(
  page: Page,
  menuItemName: string
): Promise<void> {
  logProgress(`Creating file from menu item: ${menuItemName}`);
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  await clickWithDelay(page.getByRole('button', { name: 'New' }));

  await page.waitForTimeout(CLICK_DELAY);

  await expect(page.getByRole('menuitem', { name: menuItemName })).toBeVisible();
  await clickWithDelay(page.getByRole('menuitem', { name: menuItemName }));

  const createButton = page.getByRole('button', { name: 'Create' });
  await expect(createButton).toBeVisible();

  await page.waitForTimeout(CLICK_DELAY);
  await clickWithDelay(createButton);

  await page.waitForTimeout(EDITOR_OPEN_DELAY);
}

async function writeDocumentText(page: Page): Promise<void> {
  logProgress('Writing text into document');
  const editorFrame = page.frameLocator('iframe');

  await editorFrame.locator('body').click();
  await page.keyboard.type('Playwright test text');

  await saveIfAvailable(page);
}

async function writePresentationText(page: Page): Promise<void> {
  logProgress('Writing text into presentation');
  const editorFrame = page.frameLocator('iframe');

  await editorFrame.locator('body').click();
  await page.keyboard.type('Playwright presentation text');

  await saveIfAvailable(page);
}

async function writeSpreadsheetText(page: Page): Promise<void> {
  logProgress('Writing text into spreadsheet');
  const editorFrame = page.frameLocator('iframe');

  await editorFrame.locator('body').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('Playwright spreadsheet text');
  await page.keyboard.press('Enter');

  await saveIfAvailable(page);
}

async function saveIfAvailable(page: Page): Promise<void> {
  logProgress('Trying to save file if Save button is available');
  const saveButton = page.getByRole('button', { name: /Save/i });

  if (await saveButton.isVisible().catch(() => false)) {
    await saveButton.click();
    await page.waitForTimeout(CLICK_DELAY);
  }
}

async function closeEditorAndReturnToFiles(page: Page): Promise<void> {
  logProgress('Closing editor and returning to files list');
  const closeButton = page.getByRole('button', { name: 'Close editor' });

  if (await closeButton.isVisible().catch(() => false)) {
    await Promise.all([
      page.waitForURL(/\/nextcloud\/apps\/files\/files/),
      closeButton.click(),
    ]);

    await page.waitForTimeout(CLICK_DELAY);
  } else {
    await page.goto(`${NEXTCLOUD_URL}/apps/files/files`, {
      waitUntil: 'domcontentloaded',
    });
  }

  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
}
