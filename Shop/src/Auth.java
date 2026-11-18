import java.security.SecureRandom;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Хранение паролей: соль + PBKDF2. Сам пароль нигде не сохраняется. */
public final class Auth {
    private static final SecureRandom RND = new SecureRandom();

    private Auth() {
    }

    static String randomToken(int bytes) {
        byte[] b = new byte[bytes];
        RND.nextBytes(b);
        return hex(b);
    }

    static String hash(String password, String salt) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt.getBytes("UTF-8"), 60000, 256);
            return hex(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static boolean check(String password, String salt, String expected) {
        String actual = hash(password, salt);
        // сравнение без раннего выхода
        int diff = actual.length() ^ expected.length();
        for (int i = 0; i < Math.min(actual.length(), expected.length()); i++) {
            diff |= actual.charAt(i) ^ expected.charAt(i);
        }
        return diff == 0;
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) {
            sb.append(String.format("%02x", x));
        }
        return sb.toString();
    }
}
