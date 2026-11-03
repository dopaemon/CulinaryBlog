import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { registerErrorMessage, validateRegister } from './helpers';

describe('validateRegister', () => {
  it('không có lỗi khi input hợp lệ', () => {
    expect(validateRegister('Hannah Fields', 'you@example.com', 'Abcdef1!', 'hannah')).toEqual({});
  });

  it('báo lỗi displayName quá ngắn', () => {
    expect(validateRegister('A', 'you@example.com', 'Abcdef1!', 'hannah').displayName).toBeDefined();
  });

  it('báo lỗi email không hợp lệ', () => {
    expect(validateRegister('Hannah Fields', 'not-an-email', 'Abcdef1!', 'hannah').email).toBeDefined();
  });

  it('báo lỗi password thiếu ký tự đặc biệt', () => {
    expect(validateRegister('Hannah Fields', 'you@example.com', 'Abcdef12', 'hannah').password).toBeDefined();
  });

  it('báo lỗi password ngắn hơn 8 ký tự', () => {
    expect(validateRegister('Hannah Fields', 'you@example.com', 'Ab1!', 'hannah').password).toBeDefined();
  });
});

describe('registerErrorMessage', () => {
  it('409 gắn lỗi vào field email', () => {
    expect(registerErrorMessage(new ApiError(409, null))).toEqual({
      field: 'email',
      message: 'Email này đã được sử dụng.',
    });
  });

  it('429 báo thử lại sau, không gắn field', () => {
    expect(registerErrorMessage(new ApiError(429, null))).toEqual({
      message: 'Bạn đã thử quá nhiều lần, vui lòng thử lại sau.',
    });
  });

  it('lỗi không xác định trả thông báo mặc định', () => {
    expect(registerErrorMessage(new Error('network down'))).toEqual({
      message: 'Không thể đăng ký, thử lại sau.',
    });
  });
});
