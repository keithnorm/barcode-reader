// Webpack config for development
var webpack = require('webpack');

module.exports = {
  devtool: 'inline-source-map',
  entry: {
    'barcode-reader': [
      './src/barcode-reader.js'
    ]
  },
  output: {
    path: __dirname + '/dist',
    filename: 'barcode-reader.js'
  },
  module: {
    loaders: [
      { test: /\.jsx?$/, exclude: /node_modules/, loaders: ['babel-loader?']}
    ]
  },
  resolve: {
    modules: [
      'src',
      'node_modules'
    ],
    extensions: ['.json', '.js', '.jsx']
  },
  plugins: [
    new webpack.DefinePlugin({ 'typeof window': '\"object\"' }) // http://mongoosejs.com/docs/browser.html
  ]
};
