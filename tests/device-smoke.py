"""Exercise the normal station workflow in a disposable Chrome profile."""
import base64
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 15)

def element(selector):
    return wait.until(lambda d: next((e for e in d.find_elements(By.CSS_SELECTOR, selector) if e.is_displayed()), False))

def fill(selector, value):
    field = element(selector)
    field.clear()
    field.send_keys(value)

def sign_in(username, password):
    fill('#signin [name=login]', username)
    fill('#signin [name=password]', password)
    element('#signin button').click()
    element('#account')

try:
    driver.get(f"http://127.0.0.1:{server.server_port}/")
    password = "local-test-only-password"
    fill('#signin [name=name]', 'Test operator')
    fill('#signin [name=password]', password)
    fill('#signin [name=confirm]', password)
    element('#signin button').click()
    element('[data-page="7"]').click()
    element('#manage').click()
    element('#add').click()
    fill('dialog[open] [name=name]', 'Test clerk')
    fill('dialog[open] [name=login]', 'test-clerk')
    fill('dialog[open] [name=password]', password)
    fill('dialog[open] [name=confirm]', password)
    element('dialog[open] .primary').click()
    element('button[data-resetuser]')
    element('#account').click()
    sign_in('test-clerk', password)
    assert len(driver.find_elements(By.CSS_SELECTOR,'nav button')) == 1
    with TemporaryDirectory() as temp:
        photo = Path(temp) / 'meter.png'
        image = driver.execute_script("const c=document.createElement('canvas'); c.getContext('2d').fillText('123456 L',5,20);return c.toDataURL().split(',')[1]")
        photo.write_bytes(base64.b64decode(image))
        element('#add').click()
        fill('dialog[open] [name=open]', '100')
        fill('dialog[open] [name=rate]', '350')
        element('dialog[open] [name=photo]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        element('button[data-close]').click()
        fill('dialog[open] [name=close]', '140')
        element('dialog[open] [name=photo]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        element('button[data-stage=closing]')
    driver.refresh()
    sign_in('admin', password)
    element('button[data-stage=opening]').click()
    wait.until(lambda d: d.execute_script("return document.querySelector('dialog[open] img')?.naturalWidth>0"))
    element('dialog[open] button').click()
    element('[data-page="8"]').click()
    clerk = lambda: wait.until(lambda d: next((r for r in d.find_elements(By.CSS_SELECTOR,'tbody tr') if 'test-clerk' in r.text), False))
    clerk().find_element(By.CSS_SELECTOR,'[data-resetuser]').click()
    newpass = 'changed-station-password'
    fill('dialog[open] [name=password]',newpass)
    fill('dialog[open] [name=confirm]',newpass)
    element('dialog[open] .primary').click()
    wait.until(lambda d: 'Password reset for test-clerk' in d.find_element(By.ID,'view').text)
    element('#account').click()
    fill('#signin [name=login]', 'test-clerk')
    fill('#signin [name=password]', password)
    element('#signin button').click()
    wait.until(lambda d: 'Incorrect' in d.find_element(By.CSS_SELECTOR,'#signin .err').text)
    sign_in('test-clerk',newpass)
    element('button[data-stage=closing]')
    element('#account').click()
    sign_in('admin',password)
    element('[data-page="8"]').click()
    clerk().find_element(By.CSS_SELECTOR,'[data-edituser]').click()
    from selenium.webdriver.support.ui import Select
    Select(element('dialog[open] [name=status]')).select_by_value('Disabled')
    element('dialog[open] .primary').click()
    wait.until(lambda d: 'Disabled' in clerk().text)
    element('#account').click()
    element('#recoverAdmin').click()
    # Simulate GitHub identity responses without a real account token in CI.
    driver.execute_script("window.fetch=async()=>({ok:true,json:async()=>({id:0})})")
    fill('dialog[open] [name=proof]', 'test-only')
    fill('dialog[open] [name=password]', newpass)
    fill('dialog[open] [name=confirm]', newpass)
    element('dialog[open] .primary').click()
    wait.until(lambda d: 'Only the repository owner' in element('dialog[open] .err').text)
    driver.execute_script("window.fetch=async()=>({ok:true,json:async()=>({id:328499199})})")
    element('dialog[open] .primary').click()
    wait.until(lambda d: 'Password reset.' in d.find_element(By.CSS_SELECTOR,'#signin .err').text)
    sign_in('admin',newpass)
    element('button[data-stage=opening]')
    print("Verified admin setup, staff creation, role navigation, shift handover, persistence and photo retrieval.")
finally:
    driver.quit()
    server.shutdown()

