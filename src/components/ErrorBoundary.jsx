import { Component } from 'react';
import { Link } from 'react-router-dom';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <div className="empty-state">
            <h3>Something went wrong</h3>
            <p>An unexpected error occurred. Please try again.</p>
            <Link to="/" className="empty-state-action">Go Home</Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
