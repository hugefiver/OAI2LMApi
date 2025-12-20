# Contributing to OAI2LMApi

Thank you for your interest in contributing to OAI2LMApi! This document provides guidelines for contributing to the project.

## Development Setup

1. **Prerequisites**
   - Node.js (v20 or higher)
   - npm
   - VSCode (for testing)

2. **Clone and Install**
   ```bash
   git clone https://github.com/hugefiver/OAI2LMApi.git
   cd OAI2LMApi
   npm install
   ```

3. **Build**
   ```bash
   npm run compile
   ```

4. **Watch Mode** (for development)
   ```bash
   npm run watch
   ```

## Testing the Extension

1. Open the project in VSCode
2. Press `F5` to launch the Extension Development Host
3. Configure your API settings in the Extension Development Host
4. Test the functionality

## Project Structure

```
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── openaiClient.ts           # OpenAI API client
│   └── languageModelProvider.ts  # VSCode Language Model provider
├── out/                          # Compiled JavaScript (generated)
├── package.json                  # Extension manifest
└── tsconfig.json                 # TypeScript configuration
```

## Code Style

- Follow the existing code style
- Use TypeScript strict mode
- Run the linter before submitting:
  ```bash
  npm run lint
  ```

## Submitting Changes

1. **Fork the Repository**
2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**
   - Write clean, maintainable code
   - Follow TypeScript best practices
   - Add comments for complex logic

4. **Test Your Changes**
   - Build the extension
   - Test in Extension Development Host
   - Verify all features work as expected

5. **Commit Your Changes**
   ```bash
   git commit -m "Description of your changes"
   ```

6. **Push and Create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Pull Request Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Ensure the code compiles without errors
- Test your changes thoroughly

## Reporting Issues

When reporting issues, please include:

- VSCode version
- Extension version
- API endpoint type (OpenAI, LocalAI, etc.)
- Steps to reproduce
- Expected vs actual behavior
- Any error messages from the Developer Console

## Feature Requests

Feature requests are welcome! Please provide:

- Clear description of the feature
- Use cases
- How it would benefit users

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow

## Questions?

If you have questions, feel free to:

- Open an issue for discussion
- Check existing issues and pull requests

Thank you for contributing!
