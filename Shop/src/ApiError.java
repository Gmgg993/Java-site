/** Ошибка запроса: код ответа и понятное сообщение для пользователя. */
public final class ApiError extends RuntimeException {
    final int status;

    ApiError(int status, String message) {
        super(message);
        this.status = status;
    }
}
