export type CameraErrorCode =
  | 'camera-unavailable'
  | 'constraints-unsatisfied'
  | 'device-busy'
  | 'media-devices-unsupported'
  | 'no-camera'
  | 'permission-denied'
  | 'stream-start-failed'
  | 'unknown';

export interface CameraErrorDescriptor {
  readonly code: CameraErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
}

export function getCameraErrorDescriptor(error: unknown): CameraErrorDescriptor {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return {
        code: 'permission-denied',
        message: 'Camera access was denied. Please allow camera permissions and try again.',
        recoverable: true,
      };
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return {
        code: 'no-camera',
        message: 'No camera device was found.',
        recoverable: false,
      };
    }

    if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
      return {
        code: 'constraints-unsatisfied',
        message: 'The selected camera format is not supported by this device.',
        recoverable: true,
      };
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return {
        code: 'device-busy',
        message: 'The selected camera is already in use by another application.',
        recoverable: true,
      };
    }

    if (error.name === 'AbortError') {
      return {
        code: 'camera-unavailable',
        message: 'The camera stopped responding while the stream was starting.',
        recoverable: true,
      };
    }

    return {
      code: 'stream-start-failed',
      message: `Camera initialization failed: ${error.message}`,
      recoverable: true,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message,
      recoverable: true,
    };
  }

  return {
    code: 'unknown',
    message: 'An unknown camera error occurred.',
    recoverable: true,
  };
}
