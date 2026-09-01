from flask import Flask, render_template
import os
import shutil

app = Flask(__name__)
app.config['SERVER_NAME'] = 'localhost'

def build_static():
    # Create dist directory
    if os.path.exists('dist'):
        shutil.rmtree('dist')
    os.makedirs('dist')
    
    # Copy static files
    if os.path.exists('static'):
        shutil.copytree('static', 'dist/static')
    
    # Render the template with proper context
    with app.app_context():
        with app.test_request_context():
            rendered = render_template('index.html')
            
            # Write to dist/index.html
            with open('dist/index.html', 'w') as f:
                f.write(rendered)
    
    print("✓ Static site built successfully in 'dist' directory")

if __name__ == '__main__':
    build_static()
