/** Юнит-тесты логики (utils, store-редьюсеры, ИИ-разбор, звук). Запуск: npm test */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '\\.[jt]sx?$': ['babel-jest', {
      babelrc: false,
      configFile: false,
      presets: ['@babel/preset-typescript'],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    }],
  },
  moduleNameMapper: { '\\.(wav|png|jpg)$': '<rootDir>/__tests__/helpers/fileStub.js' },
};
