"""Exercise the normal station workflow in a disposable Chrome profile."""
import base64
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 15, ignored_exceptions=(StaleElementReferenceException,))

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
    element('#register').click()
    fill('dialog [name=name]', 'Test operator')
    fill('dialog [name=password]', password)
    fill('dialog [name=confirm]', password)
    element('dialog .primary').click()
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
    element('#register').click()
    fill('dialog [name=name]', 'Registration test')
    fill('dialog [name=login]', 'new-attendant')
    fill('dialog [name=password]', password)
    fill('dialog [name=confirm]', password)
    element('dialog .primary').click()
    wait.until(lambda d: 'Registration submitted' in element('#signin .err').text)
    fill('#signin [name=login]', 'new-attendant')
    fill('#signin [name=password]', password)
    element('#signin button').click()
    wait.until(lambda d: 'Incorrect' in element('#signin .err').text)
    sign_in('admin', password)
    element('[data-page="8"]').click()
    request = wait.until(lambda d: next((r for r in d.find_elements(By.CSS_SELECTOR,'tbody tr') if 'Pending approval' in r.text), False))
    request.find_element(By.CSS_SELECTOR,'[data-edituser]').click()
    element('dialog .primary').click()
    wait.until(lambda d: 'Account updated for new-attendant' in element('#view').text)
    element('#account').click()
    sign_in('new-attendant', password)
    assert len(driver.find_elements(By.CSS_SELECTOR,'nav button')) == 1
    element('#account').click()
    wait.until(lambda d: d.execute_script('return !!navigator.serviceWorker.controller'))
    driver.execute_cdp_cmd('Network.enable', {})
    driver.execute_cdp_cmd('Network.emulateNetworkConditions', {'offline':True,'latency':0,'downloadThroughput':0,'uploadThroughput':0})
    server.shutdown()
    server.server_close()
    driver.get(f"http://127.0.0.1:{server.server_port}/?release=offline")
    assert 'Working offline' in element('#offlineStatus').text
    sign_in('test-clerk', password)
    assert len(driver.find_elements(By.CSS_SELECTOR,'nav button')) == 1
    with TemporaryDirectory() as temp:
        photo = Path(temp) / 'meter.png'
        image = driver.execute_script("const c=document.createElement('canvas'); c.getContext('2d').fillText('123456 L',5,20);return c.toDataURL().split(',')[1]")
        photo.write_bytes(base64.b64decode(image))
        element('#add').click()
        assert len(driver.find_elements(By.CSS_SELECTOR,'dialog[open] fieldset')) == 4
        element('dialog[open] [data-single]').click()
        driver.execute_script("arguments[0].value='22:30'", element('dialog[open] [name=startTime]'))
        fill('dialog[open] [name=open]', '1000')
        fill('dialog[open] [name=rate]', '350')
        element('dialog[open] [name=photo]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        element('button[data-close]').click()
        fill('dialog[open] [name=close]', '1050')
        assert driver.execute_script('return arguments[0].validity.rangeOverflow', element('dialog[open] [name=close]'))
        fill('dialog[open] [name=close]', '1000')
        assert 'Fuel sold: 0 L' in element('dialog[open] output').text
        fill('dialog[open] [name=close]', '750')
        assert 'Fuel sold: 250 L' in element('dialog[open] output').text
        element('dialog[open] [name=photo]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        element('button[data-stage=closing]')
        assert '87,500' in element('#view table tbody').text
        element('[data-work]').click()
        assert '87,500' in element('.work-record tbody').text
        assert '22:30' in element('.work-record tbody').text
        element('.work-record [data-print]').click()
        printed = driver.execute_script("return document.querySelector('.work-record iframe').contentDocument.body.innerText")
        assert all(v in printed for v in ('Test clerk','test-clerk','22:30','87,500','250'))
        assert 'Meter photos' not in printed
        element('.work-record [data-dismiss]').click()
    assert driver.execute_script("return net({open:100,close:140,returned:2})") == 38
    driver.refresh()
    sign_in('admin', password)
    element('button[data-stage=opening]').click()
    wait.until(lambda d: d.execute_script("return document.querySelector('dialog[open] img')?.naturalWidth>0"))
    element('dialog[open] button').click()
    element('[data-page="8"]').click()
    clerk = lambda: wait.until(lambda d: next((r for r in d.find_elements(By.CSS_SELECTOR,'tbody tr') if 'test-clerk' in r.text), False))
    clerk().find_element(By.CSS_SELECTOR,'[data-work]').click()
    assert '250' in element('.work-record tbody').text
    element('.work-record [data-workphoto][data-stage=closing]').click()
    wait.until(lambda d: d.execute_script("return document.querySelector('dialog[open] img')?.naturalWidth>0"))
    element('dialog[open]:last-of-type button').click()
    element('.work-record [data-dismiss]').click()
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
    element('[data-page="7"]').click()
    element('#addTank').click()
    fill('#fields [name=name]', 'Reserve petrol')
    fill('#fields [name=opening]', '3000')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('button[data-id="n00"]').click()
    Select(element('#fields [name=tank]')).select_by_visible_text('Reserve petrol')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('[data-page="0"]').click()
    assert '3,000 L' in element('.tanks').text
    element('#add').click()
    assert len(driver.find_elements(By.CSS_SELECTOR,'dialog[open] fieldset')) == 4
    Select(element('dialog[open] [name=shift]')).select_by_value('Evening')
    with TemporaryDirectory() as temp:
        photo = Path(temp) / 'meter.png'
        photo.write_bytes(base64.b64decode(image))
        for i in range(4):
            fill(f'[name=litres{i}]', '1000')
            fill(f'[name=rate{i}]', '350')
            element(f'[name=photo{i}]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        element('button[data-close]').click()
        for i in range(4):
            fill(f'[name=litres{i}]', '750')
            element(f'[name=photo{i}]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        wait.until(lambda d: '2,750 L' in element('.tanks').text)
    element('[data-page="1"]').click()
    assert len(driver.find_elements(By.CSS_SELECTOR,'#view section > .scroll > table > tbody > tr')) == 2
    group = element('[data-shift-details]').find_element(By.XPATH, '../..')
    assert all(value in group.text for value in ('Evening','4 nozzles','1,000','350,000'))
    element('[data-shift-details]').click()
    assert len(driver.find_elements(By.CSS_SELECTOR,'[data-stage=closing]')) == 5
    element('[data-shift-details]').click()
    assert len(driver.find_elements(By.CSS_SELECTOR,'[data-stage=closing]')) == 1
    element('[data-page="0"]').click()
    for period in ['Daily','Weekly','Monthly','Yearly']:
        Select(element('#progressPeriod')).select_by_visible_text(period)
        assert period+' progress report' in element('#progressReport').text
        assert '1,250' in element('#progressReport').text
    element('#printProgress').click()
    assert 'Yearly progress report' in driver.execute_script("return document.querySelector('#reportFrame').contentDocument.body.innerText")
    element('#addFuel').click()
    fill('#fields [name=name]', 'Premium petrol')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('#addTank').click()
    fill('#fields [name=name]', 'Premium underground')
    Select(element('#fields [name=fuel]')).select_by_visible_text('Premium petrol')
    fill('#fields [name=opening]', '1500')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    assert 'Premium underground' in element('.tanks').text
    element('[data-page="7"]').click()
    element('#add').click()
    fill('#fields [name=name]', 'Premium C')
    Select(element('#fields [name=fuel]')).select_by_visible_text('Premium petrol')
    Select(element('#fields [name=tank]')).select_by_visible_text('Premium underground')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('[data-page="2"]').click()
    element('#add').click()
    Select(element('#fields [name=fuel]')).select_by_visible_text('Premium petrol')
    Select(element('#fields [name=tank]')).select_by_visible_text('Premium underground')
    fill('#fields [name=company]', 'Premium delivery')
    fill('#fields [name=qty]', '500')
    fill('#fields [name=cost]', '240')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('[data-page="0"]').click()
    assert '2,000 L' in element('.tanks').text
    print("Verified tank stock and all-nozzle shift handover.")
    print("Verified admin setup, staff creation, role navigation, shift handover, persistence and photo retrieval.")
finally:
    driver.quit()
    server.shutdown()
