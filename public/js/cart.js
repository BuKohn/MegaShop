document.addEventListener('DOMContentLoaded', function() {
    const messageDiv = document.getElementById('cart-message');

    function showMessage(text, isError = false) {
        if (messageDiv) {
            messageDiv.textContent = text;
            messageDiv.style.color = isError ? 'red' : 'green';
            setTimeout(() => { messageDiv.textContent = ''; }, 3000);
        }
    }

    // Обработчик удаления товара
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const productId = this.dataset.productId;
            const cartItem = this.closest('.cart-item');

            if (!confirm('Удалить этот товар из корзины?')) {
                return;
            }

            try {
                const response = await fetch(`/cart/remove/${productId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (result.success) {
                    showMessage('Товар удалён');

                    if (cartItem) {
                        cartItem.style.opacity = '0';
                        cartItem.style.transform = 'translateX(-20px)';
                        cartItem.style.transition = 'all 0.3s';
                        setTimeout(() => {
                            cartItem.remove();

                            // Если корзина пустая
                            if (document.querySelectorAll('.cart-item').length === 0) {
                                location.reload();
                            }
                        }, 300);
                    }
                } else {
                    showMessage((result.message || 'Ошибка'), true);
                }
            } catch (error) {
                console.error('Ошибка:', error);
                showMessage('Ошибка соединения', true);
            }
        });
    });
});