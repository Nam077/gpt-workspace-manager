const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/main.ts',  // Điểm vào của ứng dụng
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
  },
  "target": "node",
};
