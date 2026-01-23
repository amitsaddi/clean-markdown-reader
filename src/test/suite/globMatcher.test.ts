import {
  globToRegex,
  matchesGlob,
  validateGlobPattern,
} from '../../utils/globMatcher';

describe('globMatcher', () => {
  describe('globToRegex', () => {
    it('should return match-all regex for empty pattern', () => {
      const regex = globToRegex('');
      expect(regex.test('anything.md')).toBe(true);
      expect(regex.test('')).toBe(true);
    });

    it('should convert * to match any characters except separator', () => {
      const regex = globToRegex('*.md');
      expect(regex.test('file.md')).toBe(true);
      expect(regex.test('another-file.md')).toBe(true);
      expect(regex.test('file.txt')).toBe(false);
      expect(regex.test('folder/file.md')).toBe(false);
    });

    it('should convert ** to match any path including separators', () => {
      const regex = globToRegex('**/*.md');
      expect(regex.test('file.md')).toBe(true);
      expect(regex.test('folder/file.md')).toBe(true);
      expect(regex.test('deep/nested/folder/file.md')).toBe(true);
    });

    it('should convert ? to match single character', () => {
      const regex = globToRegex('file?.md');
      expect(regex.test('file1.md')).toBe(true);
      expect(regex.test('fileA.md')).toBe(true);
      expect(regex.test('file.md')).toBe(false);
      expect(regex.test('file12.md')).toBe(false);
    });

    it('should handle character classes [abc]', () => {
      const regex = globToRegex('file[123].md');
      expect(regex.test('file1.md')).toBe(true);
      expect(regex.test('file2.md')).toBe(true);
      expect(regex.test('file3.md')).toBe(true);
      expect(regex.test('file4.md')).toBe(false);
    });

    it('should escape special regex characters', () => {
      const regex = globToRegex('file.name.md');
      expect(regex.test('file.name.md')).toBe(true);
      expect(regex.test('filexnamemd')).toBe(false);
    });
  });

  describe('matchesGlob', () => {
    it('should match *.md pattern', () => {
      expect(matchesGlob('README.md', '*.md')).toBe(true);
      expect(matchesGlob('file.txt', '*.md')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(matchesGlob('README.MD', '*.md')).toBe(true);
      expect(matchesGlob('readme.md', '*.MD')).toBe(true);
    });
  });

  describe('validateGlobPattern', () => {
    it('should return valid for empty pattern', () => {
      const result = validateGlobPattern('');
      expect(result.isValid).toBe(true);
    });

    it('should return valid for correct patterns', () => {
      expect(validateGlobPattern('*.md').isValid).toBe(true);
      expect(validateGlobPattern('**/*.md').isValid).toBe(true);
      expect(validateGlobPattern('[abc].md').isValid).toBe(true);
    });

    it('should return invalid for unclosed brackets', () => {
      const result = validateGlobPattern('[abc.md');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unclosed bracket');
    });
  });
});
