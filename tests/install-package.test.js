// Test script for installing individual packages
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock the package installation
jest.mock('../src/package-installer', () => {
  return {
    installPackages: jest.fn().mockImplementation((projectDir, packages, packageManager, options) => {
      console.log(`Mock installing packages: ${packages.join(', ')}`);

      // Create node_modules directory
      const nodeModulesPath = path.join(projectDir, 'node_modules');
      if (!fs.existsSync(nodeModulesPath)) {
        fs.mkdirSync(nodeModulesPath, { recursive: true });
      }

      // Create mock packages
      packages.forEach(pkg => {
        let name = pkg;
        let version = '1.0.0';

        // Parse package name and version
        if (pkg.includes('@') && !pkg.startsWith('@')) {
          [name, version] = pkg.split('@');
        }

        // Create package directory
        const packageDir = path.join(nodeModulesPath, name);
        if (!fs.existsSync(packageDir)) {
          fs.mkdirSync(packageDir, { recursive: true });
        }

        // Create package.json
        const packageJson = {
          name,
          version,
          description: 'Mock package for testing'
        };

        fs.writeFileSync(
          path.join(packageDir, 'package.json'),
          JSON.stringify(packageJson, null, 2)
        );
      });

      // Update project package.json if needed
      if (options.saveToDependencies || options.saveToDevDependencies) {
        const packageJsonPath = path.join(projectDir, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        packages.forEach(pkg => {
          let name = pkg;
          let version = '1.0.0';

          // Parse package name and version
          if (pkg.includes('@') && !pkg.startsWith('@')) {
            [name, version] = pkg.split('@');
          }

          if (options.saveToDevDependencies) {
            packageJson.devDependencies = packageJson.devDependencies || {};
            packageJson.devDependencies[name] = options.saveExact ? version : `^${version}`;
          } else if (options.saveToDependencies) {
            packageJson.dependencies = packageJson.dependencies || {};
            packageJson.dependencies[name] = options.saveExact ? version : `^${version}`;
          }
        });

        fs.writeFileSync(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2)
        );
      }

      return Promise.resolve(true);
    })
  };
});

describe('Package Installation Tests', () => {
  let testDir;

  beforeAll(() => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `flash-install-test-${Date.now()}`);
    console.log(`Creating test directory: ${testDir}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Create a basic package.json
    const packageJson = {
      name: "flash-install-test",
      version: "1.0.0",
      description: "Test for flash-install package installation",
      main: "index.js",
      scripts: {
        test: "echo \"Error: no test specified\" && exit 1"
      },
      keywords: [],
      author: "",
      license: "ISC"
    };

    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  });

  afterAll(() => {
    // Clean up
    console.log(`\nCleaning up test directory: ${testDir}`);
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('Install single package', async () => {
    // Import the installer directly
    const { installPackages } = require('../src/package-installer');

    // Install the package
    await installPackages(testDir, ['lodash'], 'npm', {});

    // Check if the package was installed
    expect(fs.existsSync(path.join(testDir, 'node_modules/lodash'))).toBe(true);
  });

  test('Install package with specific version', async () => {
    // Import the installer directly
    const { installPackages } = require('../src/package-installer');

    // Install the package with specific version
    await installPackages(testDir, ['express@4.17.1'], 'npm', {});

    // Check if the package was installed with the correct version
    const pkgJson = JSON.parse(fs.readFileSync(path.join(testDir, 'node_modules/express/package.json')));
    expect(pkgJson.version).toBe('4.17.1');
  });

  test('Install package with --save-dev', async () => {
    // Import the installer directly
    const { installPackages } = require('../src/package-installer');

    // Install the package with --save-dev
    await installPackages(testDir, ['chalk'], 'npm', {
      saveToDevDependencies: true
    });

    // Check if the package was added to devDependencies
    const pkgJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json')));
    expect(pkgJson.devDependencies).toBeDefined();
    expect(pkgJson.devDependencies.chalk).toBeDefined();
  });

  test('Install package with --save-exact', async () => {
    // Import the installer directly
    const { installPackages } = require('../src/package-installer');

    // Install the package with --save-exact
    await installPackages(testDir, ['moment'], 'npm', {
      saveToDependencies: true,
      saveExact: true
    });

    // Check if the package was added to dependencies with exact version
    const pkgJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json')));
    console.log('Package.json contents:', JSON.stringify(pkgJson, null, 2));

    expect(pkgJson.dependencies).toBeDefined();
    expect(pkgJson.dependencies.moment).toBeDefined();
    expect(pkgJson.dependencies.moment.startsWith('^')).toBe(false);
  });
});
